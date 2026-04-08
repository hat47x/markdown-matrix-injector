#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
from datetime import date
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DOCS_CSV = REPO_ROOT / "04_Documentation" / "samples" / "phase9-rule-table-benchmark-pack.csv"
FIXTURE_CSV = (
    REPO_ROOT / "03_Implement" / "test" / "fixtures" / "workspace" / "data" / "phase9-rule-table-benchmark-pack.csv"
)
REQUIRED_COLUMNS = (
    "BenchmarkTable",
    "RuleId",
    "RuleSet",
    "ConditionExpr",
    "ActionExpr",
    "EffectiveFrom",
    "ExpiresAt",
    "RelatedRequirement",
    "RelatedTest",
)


def read_header(path: Path) -> list[str]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle)
        header = next(reader, None)
    if header is None:
        raise ValueError(f"empty csv: {path}")
    return header


def read_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise ValueError(f"empty csv: {path}")
        return list(reader)


def validate_quality(path: Path) -> list[str]:
    errors: list[str] = []
    rows = read_rows(path)
    seen_rule_ids: set[str] = set()

    for row_index, row in enumerate(rows, start=2):
        for column in REQUIRED_COLUMNS:
            value = row.get(column, "")
            if not value or not value.strip():
                errors.append(f"{path}: row {row_index} missing required column `{column}`")

        rule_id = (row.get("RuleId") or "").strip()
        if rule_id:
            if rule_id in seen_rule_ids:
                errors.append(f"{path}: row {row_index} duplicate RuleId `{rule_id}`")
            seen_rule_ids.add(rule_id)

        parsed_effective = parse_iso_date(row.get("EffectiveFrom", ""))
        parsed_expires = parse_iso_date(row.get("ExpiresAt", ""))
        if parsed_effective is None and (row.get("EffectiveFrom") or "").strip():
            errors.append(
                f"{path}: row {row_index} invalid date format in `EffectiveFrom` (`{row.get('EffectiveFrom')}` expected YYYY-MM-DD)"
            )
        if parsed_expires is None and (row.get("ExpiresAt") or "").strip():
            errors.append(
                f"{path}: row {row_index} invalid date format in `ExpiresAt` (`{row.get('ExpiresAt')}` expected YYYY-MM-DD)"
            )
        if parsed_effective and parsed_expires and parsed_effective > parsed_expires:
            errors.append(
                f"{path}: row {row_index} invalid date range (`EffectiveFrom` must be <= `ExpiresAt`)"
            )

    return errors


def validate_sync(docs_csv: Path, fixture_csv: Path, ignore_row_order: bool = False) -> list[str]:
    errors: list[str] = []
    docs_header = read_header(docs_csv)
    fixture_header = read_header(fixture_csv)

    if docs_header != fixture_header:
        errors.append(f"header mismatch: docs={','.join(docs_header)} fixture={','.join(fixture_header)}")
    else:
        docs_rows = normalize_rows(docs_csv, docs_header)
        fixture_rows = normalize_rows(fixture_csv, fixture_header)
        if ignore_row_order:
            docs_rows = sorted(docs_rows)
            fixture_rows = sorted(fixture_rows)
        if docs_rows != fixture_rows:
            errors.append(
                f"row mismatch: docs_rows={len(docs_rows)} fixture_rows={len(fixture_rows)} first_diff={first_row_diff(docs_rows, fixture_rows)}"
            )

    errors.extend(validate_quality(docs_csv))
    errors.extend(validate_quality(fixture_csv))
    return errors


def parse_iso_date(value: str) -> date | None:
    normalized = value.strip()
    if not normalized:
        return None
    try:
        return date.fromisoformat(normalized)
    except ValueError:
        return None


def normalize_rows(path: Path, header: list[str]) -> list[tuple[str, ...]]:
    rows = read_rows(path)
    normalized: list[tuple[str, ...]] = []
    for row in rows:
        normalized.append(tuple((row.get(column, "") or "").strip() for column in header))
    return normalized


def first_row_diff(docs_rows: list[tuple[str, ...]], fixture_rows: list[tuple[str, ...]]) -> str:
    min_length = min(len(docs_rows), len(fixture_rows))
    for index in range(min_length):
        if docs_rows[index] != fixture_rows[index]:
            return str(index + 2)  # CSV row index including header row
    if len(docs_rows) != len(fixture_rows):
        return "length-only"
    return "none"


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate Phase9 docs/fixture sync and quality rules.")
    parser.add_argument("--docs", default=str(DOCS_CSV), help="docs CSV path")
    parser.add_argument("--fixture", default=str(FIXTURE_CSV), help="fixture CSV path")
    parser.add_argument("--format", choices=("text", "json"), default="text", help="output format")
    parser.add_argument(
        "--ignore-row-order",
        action="store_true",
        help="compare row sets without considering row order",
    )
    args = parser.parse_args()

    docs_csv = Path(args.docs)
    fixture_csv = Path(args.fixture)

    try:
        errors = validate_sync(docs_csv, fixture_csv, ignore_row_order=args.ignore_row_order)
    except (FileNotFoundError, ValueError) as exc:
        print_result("NG", [], [str(exc)], args.format)
        return 1

    if errors:
        print_result("NG", [], errors, args.format)
        return 1

    docs_header = read_header(docs_csv)
    print_result("OK", docs_header, [], args.format)
    return 0


def print_result(status: str, header: list[str], errors: list[str], output_format: str) -> None:
    if output_format == "json":
        print(
            json.dumps(
                {
                    "status": status.lower(),
                    "header": header,
                    "errors": errors,
                },
                ensure_ascii=False,
            )
        )
        return

    print(f"phase9 template sync: {status}")
    if header:
        print(f"header: {','.join(header)}")
    for error in errors:
        print(f"- {error}")


if __name__ == "__main__":
    raise SystemExit(main())
