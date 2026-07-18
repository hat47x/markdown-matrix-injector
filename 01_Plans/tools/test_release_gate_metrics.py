from __future__ import annotations

import csv
import json
import tempfile
import unittest
from pathlib import Path

from release_gate_metrics import build_metrics_row, load_results, write_metrics_csv


class ReleaseGateMetricsTests(unittest.TestCase):
    def test_build_metrics_row_counts_pass_fail(self) -> None:
        row = build_metrics_row([
            {"gate": "G1:Planning", "passed": True},
            {"gate": "G2:Tests", "passed": False},
        ])
        self.assertEqual(row["gate_total"], "2")
        self.assertEqual(row["gate_passed"], "1")
        self.assertEqual(row["gate_failed"], "1")
        self.assertEqual(row["failed_gate_names"], "G2:Tests")

    def test_load_results_requires_list_payload(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "input.json"
            p.write_text(json.dumps({"not": "list"}), encoding="utf-8")
            with self.assertRaises(ValueError):
                load_results(p)

    def test_write_metrics_csv_writes_single_row(self) -> None:
        row = {
            "generated_at_utc": "2026-04-02T00:00:00Z",
            "gate_total": "2",
            "gate_passed": "2",
            "gate_failed": "0",
            "failed_gate_names": "",
        }
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "out" / "metrics.csv"
            write_metrics_csv(p, row)
            with p.open("r", encoding="utf-8", newline="") as f:
                items = list(csv.DictReader(f))
            self.assertEqual(len(items), 1)
            self.assertEqual(items[0]["gate_total"], "2")


if __name__ == "__main__":
    unittest.main()
