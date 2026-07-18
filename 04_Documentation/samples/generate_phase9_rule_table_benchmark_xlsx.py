#!/usr/bin/env python3
"""Phase 9 ベンチマーク CSV から XLSX を生成する。

Usage:
  python3 04_Documentation/samples/generate_phase9_rule_table_benchmark_xlsx.py
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path

CSV_PATH = Path(__file__).with_name("phase9-rule-table-benchmark-pack.csv")
OUT_PATH = Path(__file__).with_name("phase9-rule-table-benchmark-pack.xlsx")


def build_workbook(csv_path: Path, out_path: Path) -> None:
    try:
        from openpyxl import Workbook
    except ModuleNotFoundError as exc:  # pragma: no cover
        raise SystemExit(
            "openpyxl is required. Install it with: python3 -m pip install --user openpyxl"
        ) from exc

    with csv_path.open("r", encoding="utf-8", newline="") as handle:
        rows = list(csv.reader(handle))

    if not rows:
        raise SystemExit(f"no rows found: {csv_path}")

    wb = Workbook()
    ws = wb.active
    ws.title = "Phase9Benchmark"
    for row in rows:
        ws.append(row)

    wb.save(out_path)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate phase9 benchmark xlsx from canonical csv")
    parser.add_argument("--csv", default=str(CSV_PATH), help="source csv path")
    parser.add_argument("--out", default=str(OUT_PATH), help="output xlsx path")
    args = parser.parse_args()

    build_workbook(Path(args.csv), Path(args.out))
    print(f"generated: {Path(args.out)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
