from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import phase10_sla_dashboard as dashboard


class Phase10SlaDashboardTests(unittest.TestCase):
    @staticmethod
    def run_cli(input_path: Path, output_path: Path, markdown_path: Path | None = None) -> subprocess.CompletedProcess[str]:
        command = [
            sys.executable,
            str(Path(__file__).with_name("phase10_sla_dashboard.py")),
            "--input",
            str(input_path),
            "--output",
            str(output_path),
        ]
        if markdown_path is not None:
            command.extend(["--markdown-output", str(markdown_path)])
        return subprocess.run(command, check=False, capture_output=True, text=True)

    def test_evaluate_dashboard_detects_overdue_for_all_three_stages(self) -> None:
        now = datetime(2026, 4, 11, 12, 0, 0, tzinfo=timezone.utc)
        records = [
            {
                "source": "docs-check",
                "gate": "docs-check",
                "status": "fail",
                "failure_category": "path",
                "impact_persona": "author",
                "collected_at": "2026-04-10T06:00:00Z",  # 30h ago -> triage overdue
            },
            {
                "source": "integration",
                "gate": "integration",
                "status": "fail",
                "failure_category": "render",
                "impact_persona": "delivery",
                "collected_at": "2026-04-08T09:00:00Z",  # 75h ago -> triage/workaround overdue
            },
            {
                "source": "unit",
                "gate": "unit",
                "status": "fail",
                "failure_category": "query",
                "impact_persona": "reviewer",
                "collected_at": "2026-04-03T11:00:00Z",  # 169h ago -> all overdue incl fix
            },
        ]

        result = dashboard.evaluate_dashboard(records, now=now)
        self.assertEqual(result["overdueByStage"]["triage"], 3)
        self.assertEqual(result["overdueByStage"]["workaround"], 2)
        self.assertEqual(result["overdueByStage"]["fix"], 1)
        self.assertGreater(result["overdueCount"], 0)

    def test_evaluate_dashboard_excludes_pass_status_from_overdue(self) -> None:
        now = datetime(2026, 4, 11, 12, 0, 0, tzinfo=timezone.utc)
        records = [
            {
                "source": "docs-check",
                "gate": "docs-check",
                "status": "pass",
                "failure_category": "unknown",
                "impact_persona": "reviewer",
                "collected_at": "2026-04-01T00:00:00Z",
            }
        ]
        result = dashboard.evaluate_dashboard(records, now=now)
        self.assertEqual(result["overdueCount"], 0)
        self.assertEqual(result["overdueByStage"]["triage"], 0)
        self.assertEqual(result["overdueByStage"]["workaround"], 0)
        self.assertEqual(result["overdueByStage"]["fix"], 0)

    def test_parse_harvest_artifact_rejects_bad_persona(self) -> None:
        payload = {
            "records": [
                {
                    "source": "unit",
                    "gate": "unit",
                    "status": "pass",
                    "failure_category": "unknown",
                    "impact_persona": "manager",
                    "collected_at": "2026-04-11T00:00:00Z",
                }
            ]
        }

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "harvest.json"
            path.write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaisesRegex(dashboard.ValidationError, "impact_persona"):
                dashboard.parse_harvest_artifact(path)

    def test_render_markdown_summary_includes_required_sections(self) -> None:
        payload = {
            "generatedAt": "2026-04-11T00:00:00Z",
            "overdueCount": 2,
            "overdueBreakdown": [
                {"failure_category": "query", "impact_persona": "reviewer", "count": 1},
                {"failure_category": "render", "impact_persona": "delivery", "count": 1},
            ],
        }
        markdown = dashboard.render_markdown_summary(payload)
        self.assertIn("期限超過件数", markdown)
        self.assertIn("超過内訳（failure_category x impact_persona）", markdown)
        self.assertIn("| query | reviewer | 1 |", markdown)

    def test_cli_outputs_json_and_markdown(self) -> None:
        payload = {
            "records": [
                {
                    "source": "phase9-sync",
                    "gate": "phase9-sync",
                    "status": "fail",
                    "failure_category": "sheet",
                    "impact_persona": "delivery",
                    "collected_at": "2026-04-01T00:00:00Z",
                }
            ]
        }

        with tempfile.TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "harvest.json"
            output_path = Path(tmp) / "dashboard.json"
            markdown_path = Path(tmp) / "dashboard.md"
            input_path.write_text(json.dumps(payload), encoding="utf-8")

            completed = self.run_cli(input_path, output_path, markdown_path)
            self.assertEqual(completed.returncode, 0, msg=completed.stderr)
            self.assertTrue(output_path.exists())
            self.assertTrue(markdown_path.exists())
            output = json.loads(output_path.read_text(encoding="utf-8"))
            first = output["records"][0]
            for key in ("gate", "status", "failure_category", "impact_persona", "sla_deadline", "sla_state"):
                self.assertIn(key, first)
            self.assertIn("OK: wrote SLA dashboard", completed.stdout)


if __name__ == "__main__":
    unittest.main()
