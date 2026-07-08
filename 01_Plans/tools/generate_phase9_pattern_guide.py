#!/usr/bin/env python3
"""Generates a standalone, MMI-independent Phase 9 pattern guide from the
canonical docs CSV (04_Documentation/samples/phase9-rule-table-benchmark-pack.csv).

ADR-0012 D7 / ADR-0013: this guide must be readable and useful to someone who
never installs the VS Code extension. MMI query syntax appears only inside an
explicitly optional callout per table; the main table never depends on it.
RelatedTest (an MMI-internal regression-test pointer) is never emitted.

This script does not read or write the fixture CSV, check_phase9_template_sync.py,
or any other Phase 9 sync-gate contract -- it is purely additive.

Usage:
    python3 generate_phase9_pattern_guide.py             # regenerate --out
    python3 generate_phase9_pattern_guide.py --check     # verify, no write
"""
from __future__ import annotations

import argparse
import difflib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DOCS_CSV = REPO_ROOT / "04_Documentation" / "samples" / "phase9-rule-table-benchmark-pack.csv"
OUT_MD = REPO_ROOT / "04_Documentation" / "samples" / "phase9-rule-table-pattern-guide.md"

# 10 columns shown in the main, tool-independent table. BenchmarkTable is used
# only for grouping (not shown per-row); QueryExample is shown separately in an
# optional callout; RelatedTest is never shown (it is an MMI-internal
# regression-test pointer with no value to a generic reader).
MAIN_TABLE_COLUMNS = (
    "RuleId",
    "RuleSet",
    "ConditionExpr",
    "ActionExpr",
    "Priority",
    "EffectiveFrom",
    "ExpiresAt",
    "RelatedRequirement",
    "Owner",
    "Notes",
)

# Hand-authored, generic (non-MMI-specific) purpose text per BenchmarkTable
# value. A CSV row whose BenchmarkTable is not a key here fails the generator
# outright, rather than silently shipping a table with no explanation --
# authors must extend this dict whenever a new BenchmarkTable value is added
# to the CSV.
BENCHMARK_TABLE_DESCRIPTIONS: dict[str, str] = {
    "RequirementsTraceability": (
        "要件と検証（テスト/レビュー）の対応関係を追跡する表です。各行が1つの要件対応ルールを表し、"
        "「どの要件が」「どの条件で」「どう検証済みとみなすか」を宣言的に記録します。"
        "監査時に要件カバレッジを説明する根拠として使えます。"
    ),
    "StateTransition": (
        "文書やチケットなどのライフサイクル状態遷移を定義する表です。各行が1つの遷移ルールを表し、"
        "「どの状態から」「どの条件で」「どの状態へ」「何をトリガーに」遷移するかを記録します。"
        "承認フローやワークフロー設計のレビュー資料として使えます。"
    ),
    "FailureTriage": (
        "障害・問い合わせの一次切り分けルールを定義する表です。各行が1つの切り分けルールを表し、"
        "「どんな症状が」「どんな条件のとき」「どう分類・対応するか」を記録します。"
        "サポート担当者の初動対応マニュアルとして使えます。"
    ),
    "ReleaseGateDecision": (
        "リリース可否判定のルールを定義する表です。各行が1つの判定ルールを表し、"
        "「どの検証結果が」「どんな条件のとき」「リリースを許可/ブロックするか」を記録します。"
        "リリース判定会議の判断根拠として使えます。"
    ),
}


class UnknownBenchmarkTableError(ValueError):
    """Raised when a CSV row's BenchmarkTable has no registered description."""


def read_rows(csv_path: Path) -> list[dict[str, str]]:
    """Reads the Phase 9 benchmark CSV.

    IMPORTANT: `QueryExample` values legitimately contain unescaped commas
    (e.g. "header=first&columns=A,B,C"), and this file is not quote-escaped
    to protect them -- a standard `csv.DictReader` misparses every column
    after `QueryExample` as a result. This is a pre-existing property of the
    canonical data (predates this script), not something introduced here;
    `03_Implement/test/markdownMatrixPlugin.test.ts`'s `loadPhase9BenchmarkRows`
    already works around the identical issue with an equivalent fixed-column
    reconstruction. This reader mirrors that approach: split each line on
    ',', treat the columns before `QueryExample` and from `RelatedRequirement`
    onward as fixed-width, and rejoin everything between as the QueryExample
    value.
    """
    with csv_path.open("r", encoding="utf-8", newline="") as handle:
        lines = [line for line in handle.read().splitlines() if line.strip()]

    if not lines:
        return []

    header = lines[0].split(",")
    query_example_index = header.index("QueryExample")
    trailing_count = len(header) - header.index("RelatedRequirement")

    rows: list[dict[str, str]] = []
    for line in lines[1:]:
        raw_fields = line.split(",")
        leading = raw_fields[:query_example_index]
        trailing = raw_fields[-trailing_count:]
        query_example = ",".join(raw_fields[query_example_index : len(raw_fields) - trailing_count])
        values = [*leading, query_example, *trailing]
        rows.append(dict(zip(header, values)))
    return rows


def group_by_benchmark_table(rows: list[dict[str, str]]) -> dict[str, list[dict[str, str]]]:
    """Groups rows by BenchmarkTable in first-seen order (dict insertion order)."""
    grouped: dict[str, list[dict[str, str]]] = {}
    for row in rows:
        table_name = row.get("BenchmarkTable", "")
        if table_name not in BENCHMARK_TABLE_DESCRIPTIONS:
            raise UnknownBenchmarkTableError(
                f"BenchmarkTable {table_name!r} has no entry in BENCHMARK_TABLE_DESCRIPTIONS. "
                "Add a generic (non-MMI-specific) description before regenerating the guide."
            )
        grouped.setdefault(table_name, []).append(row)
    return grouped


def escape_markdown_cell(value: str) -> str:
    return (value or "").replace("|", "\\|").replace("\n", " ").strip()


def render_main_table(rows: list[dict[str, str]]) -> str:
    header = "| " + " | ".join(MAIN_TABLE_COLUMNS) + " |"
    separator = "|" + "|".join("---" for _ in MAIN_TABLE_COLUMNS) + "|"
    lines = [header, separator]
    for row in rows:
        cells = [escape_markdown_cell(row.get(column, "")) for column in MAIN_TABLE_COLUMNS]
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines)


def render_optional_query_callout(rows: list[dict[str, str]]) -> str:
    lines = [
        "> **Optional: query this table with Markdown Matrix Injector**",
        ">",
        "> MMI をお使いの場合、以下のクエリパラメータ例を "
        "`![[phase9-rule-table-benchmark-pack.csv#Sheet1|<range>?mode=table&...]]` へ追加することで、"
        "本テーブルの断面を Markdown へインライン表示できます（本ガイドの理解に MMI は不要です）。",
        ">",
    ]
    for row in rows:
        rule_id = row.get("RuleId", "")
        query_example = row.get("QueryExample", "")
        if query_example:
            lines.append(f"> - `{rule_id}`: `{query_example}`")
    return "\n".join(lines)


def render_guide(rows: list[dict[str, str]]) -> str:
    grouped = group_by_benchmark_table(rows)

    lines = [
        "# Phase 9 表パターンガイド (SIer 設計文書向け・ツール非依存)",
        "",
        "> このガイドは Markdown Matrix Injector (MMI) や VS Code を一切インストールせずに読める、"
        "汎用的な SIer 設計文書向け表パターン集です。各パターンは Word / Excel / 任意の Markdown "
        "ビューアでもそのまま活用できます。MMI によるクエリ例は各表の末尾に **任意** の補足として"
        "示していますが、本ガイドの利用に MMI は必須ではありません。",
        "",
        "生成元データ: `phase9-rule-table-benchmark-pack.csv`"
        "（本ガイドは `01_Plans/tools/generate_phase9_pattern_guide.py` により機械生成されます。直接編集しないでください）。",
        "",
    ]

    for table_name, table_rows in grouped.items():
        lines.append(f"## {table_name}")
        lines.append("")
        lines.append(BENCHMARK_TABLE_DESCRIPTIONS[table_name])
        lines.append("")
        lines.append(render_main_table(table_rows))
        lines.append("")
        lines.append(render_optional_query_callout(table_rows))
        lines.append("")

    lines.append("---")
    lines.append("")
    lines.append("生データ（CSV）: [`phase9-rule-table-benchmark-pack.csv`](./phase9-rule-table-benchmark-pack.csv)  ")
    lines.append(
        "運用手順（MMI 利用者向け）: "
        "[`phase9-rule-table-template-operations.md`](../phase9-rule-table-template-operations.md)"
    )
    lines.append("")

    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate (or check) the standalone Phase 9 pattern guide from the docs CSV."
    )
    parser.add_argument("--csv", default=str(DOCS_CSV), help="Input docs CSV path")
    parser.add_argument("--out", default=str(OUT_MD), help="Output guide Markdown path")
    parser.add_argument(
        "--check",
        action="store_true",
        help="Verify the committed guide matches regeneration; exit 1 on drift without writing",
    )
    args = parser.parse_args()

    csv_path = Path(args.csv)
    out_path = Path(args.out)

    try:
        rows = read_rows(csv_path)
        rendered = render_guide(rows)
    except UnknownBenchmarkTableError as exc:
        print(f"NG: {exc}")
        return 1
    except OSError as exc:
        print(f"NG: failed to read {csv_path}: {exc}")
        return 1

    if args.check:
        if not out_path.exists():
            print(f"NG: {out_path} does not exist; run without --check to generate it")
            return 1
        existing = out_path.read_text(encoding="utf-8")
        if existing != rendered:
            diff = "\n".join(
                difflib.unified_diff(
                    existing.splitlines(),
                    rendered.splitlines(),
                    fromfile=str(out_path),
                    tofile="regenerated",
                    lineterm="",
                )
            )
            print(f"NG: {out_path} is stale relative to {csv_path}")
            print(diff)
            return 1
        print(f"OK: {out_path} is in sync with {csv_path}")
        return 0

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(rendered, encoding="utf-8")
    print(f"OK: wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
