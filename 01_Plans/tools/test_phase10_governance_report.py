from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import phase10_governance_report as report


class Phase10GovernanceReportTests(unittest.TestCase):
    @staticmethod
    def run_cli(input_path: Path, output_path: Path) -> subprocess.CompletedProcess[str]:
        command = [
            sys.executable,
            str(Path(__file__).with_name("phase10_governance_report.py")),
            "--input",
            str(input_path),
            "--output",
            str(output_path),
        ]
        return subprocess.run(command, check=False, capture_output=True, text=True)

    def test_parse_input_rejects_missing_required_key(self) -> None:
        payload = {
            "generatedAt": "2026-04-11T00:00:00Z",
            "week": {"label": "2026-W15", "startDate": "2026-04-06", "endDate": "2026-04-12"},
            "sla": {"triageHours": 24, "workaroundHours": 72, "fixHours": 168, "breaches": []},
            "nextActions": [],
        }
        with tempfile.TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "missing.json"
            input_path.write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaisesRegex(report.ValidationError, r"root missing required key\(s\): kpis"):
                report.parse_input(input_path)

    def test_render_markdown_includes_kpi_and_sla_sections(self) -> None:
        payload = {
            "generatedAt": "2026-04-11T00:00:00Z",
            "week": {"label": "2026-W15", "startDate": "2026-04-06", "endDate": "2026-04-12"},
            "kpis": {
                "adoptionLeadTimeHours": 18.0,
                "linkIntegrityDetectionRate": 98.4,
                "printReproducibilityRate": 97.9,
                "selfResolutionRate": 63.5,
            },
            "sla": {
                "triageHours": 24,
                "workaroundHours": 72,
                "fixHours": 168,
                "breaches": [
                    {
                        "ticketId": "SUP-120",
                        "stage": "workaround",
                        "elapsedHours": 81,
                        "owner": "docs-ops",
                        "note": "runbook update pending",
                    }
                ],
            },
            "nextActions": [
                {
                    "summary": "Update support runbook for XML signature diagnostics",
                    "owner": "qa-delivery",
                    "dueDate": "2026-04-14",
                    "source": "weekly-governance",
                }
            ],
        }
        markdown = report.render_markdown(payload)
        self.assertIn("## KPI Summary", markdown)
        self.assertIn("## SLA Alerts", markdown)
        self.assertIn("SUP-120", markdown)
        self.assertIn("## Next Actions", markdown)

    def test_cli_generates_report_for_valid_input(self) -> None:
        payload = {
            "generatedAt": "2026-04-11T00:00:00Z",
            "week": {"label": "2026-W15", "startDate": "2026-04-06", "endDate": "2026-04-12"},
            "kpis": {
                "adoptionLeadTimeHours": 20.25,
                "linkIntegrityDetectionRate": 99.1,
                "printReproducibilityRate": 98.0,
                "selfResolutionRate": 65.0,
            },
            "sla": {"triageHours": 24, "workaroundHours": 72, "fixHours": 168, "breaches": []},
            "nextActions": [],
        }

        with tempfile.TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "input.json"
            output_path = Path(tmp) / "report.md"
            input_path.write_text(json.dumps(payload), encoding="utf-8")

            completed = self.run_cli(input_path, output_path)
            self.assertEqual(completed.returncode, 0, msg=completed.stderr)
            self.assertIn("OK: wrote governance report", completed.stdout)
            self.assertTrue(output_path.exists())
            self.assertIn("Weekly Governance Report", output_path.read_text(encoding="utf-8"))

    def test_cli_fails_for_missing_required_keys(self) -> None:
        payload = {
            "generatedAt": "2026-04-11T00:00:00Z",
            "week": {"label": "2026-W15", "startDate": "2026-04-06", "endDate": "2026-04-12"},
            "kpis": {
                "adoptionLeadTimeHours": 20.25,
                "linkIntegrityDetectionRate": 99.1,
                "printReproducibilityRate": 98.0,
                "selfResolutionRate": 65.0,
            },
            "sla": {"triageHours": 24, "workaroundHours": 72, "fixHours": 168, "breaches": []},
        }

        with tempfile.TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "invalid.json"
            output_path = Path(tmp) / "report.md"
            input_path.write_text(json.dumps(payload), encoding="utf-8")

            completed = self.run_cli(input_path, output_path)
            self.assertEqual(completed.returncode, 1)
            self.assertIn("NG:", completed.stdout)
            self.assertIn("nextActions", completed.stdout)
            self.assertFalse(output_path.exists())


if __name__ == "__main__":
    unittest.main()
