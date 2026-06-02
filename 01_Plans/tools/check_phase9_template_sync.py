#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
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
JSON_SCHEMA_VERSION = "phase9-sync-v1"


class EmptyCsvError(ValueError):
    """Raised when a CSV file has no header row."""


class DuplicateHeaderError(ValueError):
    """Raised when a CSV header contains duplicate column names after normalization."""

    def __init__(self, columns: list[str], path: Path | None = None) -> None:
        self.columns = tuple(columns)
        self.path = str(path) if path is not None else None
        location = f": {path}" if path else ""
        super().__init__(f"duplicate csv header{location}: {','.join(columns)}")


class MissingHeaderNameError(ValueError):
    """Raised when a CSV header contains empty column names after normalization."""

    def __init__(self, positions: list[int], path: Path | None = None) -> None:
        self.positions = tuple(positions)
        self.path = str(path) if path is not None else None
        location = f": {path}" if path else ""
        index_list = ",".join(str(position) for position in positions)
        super().__init__(f"missing csv header name{location}: {index_list}")


def normalize_header_cells(header: list[str], path: Path | None = None) -> list[str]:
    normalized: list[str] = []
    for index, cell in enumerate(header):
        value = cell or ""
        if index == 0:
            value = value.lstrip("\ufeff")
        value = value.strip()
        normalized.append(value)
    missing_positions = [index + 1 for index, value in enumerate(normalized) if not value]
    if missing_positions:
        raise MissingHeaderNameError(missing_positions, path=path)
    counts = Counter(column for column in normalized if column)
    duplicates = sorted(column for column, count in counts.items() if count > 1)
    if duplicates:
        raise DuplicateHeaderError(duplicates, path=path)
    return normalized


def read_header(path: Path) -> list[str]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle)
        header = next(reader, None)
    if header is None:
        raise EmptyCsvError(f"empty csv: {path}")
    return normalize_header_cells(header, path=path)


def read_rows(path: Path) -> list[dict[str, str]]:
    _, rows = read_rows_with_header(path)
    return rows


def read_rows_with_header(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise EmptyCsvError(f"empty csv: {path}")
        raw_header = list(reader.fieldnames)
        header = normalize_header_cells(raw_header, path=path)
        rows = []
        for raw_row in reader:
            normalized_row: dict[str, str] = {}
            for raw_column, normalized_column in zip(raw_header, header):
                normalized_row[normalized_column] = raw_row.get(raw_column, "")
            rows.append(normalized_row)
    return header, rows


def validate_quality_rows(path: Path, rows: list[dict[str, str]]) -> list[str]:
    errors: list[str] = []
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


def validate_sync(
    docs_csv: Path, fixture_csv: Path, ignore_row_order: bool = False
) -> list[str]:
    errors, _ = validate_sync_with_header(docs_csv, fixture_csv, ignore_row_order=ignore_row_order)
    return errors


def validate_sync_with_header(
    docs_csv: Path, fixture_csv: Path, ignore_row_order: bool = False
) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    docs_header, docs_rows_raw = read_rows_with_header(docs_csv)
    fixture_header, fixture_rows_raw = read_rows_with_header(fixture_csv)

    if docs_header != fixture_header:
        errors.append(f"header mismatch: docs={','.join(docs_header)} fixture={','.join(fixture_header)}")
    else:
        docs_rows = normalize_rows(docs_rows_raw, docs_header)
        fixture_rows = normalize_rows(fixture_rows_raw, fixture_header)
        if ignore_row_order:
            docs_rows = sorted(docs_rows)
            fixture_rows = sorted(fixture_rows)
        if docs_rows != fixture_rows:
            errors.append(
                f"row mismatch: docs_rows={len(docs_rows)} fixture_rows={len(fixture_rows)} first_diff={first_row_diff(docs_rows, fixture_rows)}"
            )

    errors.extend(validate_quality_rows(docs_csv, docs_rows_raw))
    errors.extend(validate_quality_rows(fixture_csv, fixture_rows_raw))
    return errors, docs_header


def parse_iso_date(value: str) -> date | None:
    normalized = value.strip()
    if not normalized:
        return None
    try:
        return date.fromisoformat(normalized)
    except ValueError:
        return None


def normalize_rows(rows: list[dict[str, str]], header: list[str]) -> list[tuple[str, ...]]:
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
        errors, docs_header = validate_sync_with_header(
            docs_csv, fixture_csv, ignore_row_order=args.ignore_row_order
        )
    except (FileNotFoundError, EmptyCsvError, DuplicateHeaderError, MissingHeaderNameError, OSError) as exc:
        print_result(
            "NG",
            [],
            [format_cli_exception(exc)],
            args.format,
            error_codes=[classify_exception_code(exc)],
        )
        return 1

    if errors:
        print_result("NG", docs_header, errors, args.format, error_codes=["validation_error"] * len(errors))
        return 1

    print_result("OK", docs_header, [], args.format)
    return 0


def print_result(
    status: str,
    header: list[str],
    errors: list[str],
    output_format: str,
    error_codes: list[str] | None = None,
) -> None:
    if output_format == "json":
        print(
            json.dumps(
                {
                    "schemaVersion": JSON_SCHEMA_VERSION,
                    "status": status.lower(),
                    "header": header,
                    "errors": errors,
                    "errorCount": len(errors),
                    "errorCodes": error_codes or [],
                    "errorCodeSummary": dedupe_preserving_order(error_codes or []),
                },
                ensure_ascii=False,
                sort_keys=True,
            )
        )
        return

    print(f"phase9 template sync: {status}")
    print(f"schemaVersion: {JSON_SCHEMA_VERSION}")
    if header:
        print(f"header: {','.join(header)}")
    if error_codes:
        print(f"errorCodes: {','.join(dedupe_preserving_order(error_codes))}")
    for index, error in enumerate(errors):
        code = error_codes[index] if error_codes and index < len(error_codes) else None
        if code:
            print(f"- [{code}] {error}")
        else:
            print(f"- {error}")


def format_cli_exception(exc: Exception) -> str:
    if isinstance(exc, EmptyCsvError):
        message = str(exc)
        if message.startswith("empty csv:"):
            target = message.split("empty csv:", maxsplit=1)[1].strip()
            return f"input csv is empty: {target}"
        return message
    if isinstance(exc, DuplicateHeaderError):
        columns = ",".join(exc.columns)
        return f"input csv has duplicate header: {columns}" if columns else "input csv has duplicate header"
    if isinstance(exc, MissingHeaderNameError):
        positions = ",".join(str(position) for position in exc.positions)
        return (
            f"input csv header has empty column name at positions: {positions}"
            if positions
            else "input csv header has empty column name"
        )
    if isinstance(exc, FileNotFoundError):
        target = exc.filename or str(exc)
        return f"input file not found: {target}"
    if isinstance(exc, IsADirectoryError):
        target = exc.filename or str(exc)
        return f"input path is a directory: {target}"
    if isinstance(exc, PermissionError):
        target = exc.filename or str(exc)
        return f"input file is not readable: {target}"
    if isinstance(exc, OSError):
        target = getattr(exc, "filename", None) or "unknown"
        detail = exc.strerror or str(exc)
        return f"input I/O error: {target} ({detail})"
    return str(exc)


def classify_exception_code(exc: Exception) -> str:
    if isinstance(exc, EmptyCsvError):
        return "empty_csv"
    if isinstance(exc, DuplicateHeaderError):
        return "duplicate_header"
    if isinstance(exc, MissingHeaderNameError):
        return "missing_header_name"
    if isinstance(exc, FileNotFoundError):
        return "file_not_found"
    if isinstance(exc, IsADirectoryError):
        return "is_directory"
    if isinstance(exc, PermissionError):
        return "permission_denied"
    if isinstance(exc, OSError):
        return "io_error"
    return "unknown_error"


def dedupe_preserving_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        if item not in seen:
            seen.add(item)
            result.append(item)
    return result


if __name__ == "__main__":
    raise SystemExit(main())
