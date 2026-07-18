#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
from datetime import datetime, timezone
from pathlib import Path


def load_results(path: Path) -> list[dict[str, object]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise ValueError("release gate JSON must be a list")
    return payload


def build_metrics_row(results: list[dict[str, object]]) -> dict[str, str]:
    total = len(results)
    failed = [str(item.get("gate", "unknown")) for item in results if not bool(item.get("passed"))]
    passed_count = total - len(failed)

    return {
        "generated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "gate_total": str(total),
        "gate_passed": str(passed_count),
        "gate_failed": str(len(failed)),
        "failed_gate_names": ";".join(failed),
    }


def write_metrics_csv(path: Path, row: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = ["generated_at_utc", "gate_total", "gate_passed", "gate_failed", "failed_gate_names"]
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerow(row)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate release gate KPI CSV from JSON artifact")
    parser.add_argument("--input-file", default="artifacts/release-gate.json", help="Path to release gate JSON")
    parser.add_argument("--output-file", default="artifacts/release-gate-metrics.csv", help="Output CSV path")
    args = parser.parse_args()

    results = load_results(Path(args.input_file))
    row = build_metrics_row(results)
    write_metrics_csv(Path(args.output_file), row)
    print(f"wrote metrics: {args.output_file}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
