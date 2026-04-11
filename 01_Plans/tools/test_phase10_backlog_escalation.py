from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import phase10_backlog_escalation as escalation


def _valid_governance_payload() -> dict[str, object]:
    return {
        "generatedAt": "2026-04-11T00:00:00Z",
        "week": {"label": "2026-W15", "startDate": "2026-04-06", "endDate": "2026-04-12"},
        "kpis": {
            "adoptionLeadTimeHours": 20.0,
            "linkIntegrityDetectionRate": 99.2,
            "printReproducibilityRate": 98.5,
            "selfResolutionRate": 75.0,
        },
        "sla": {"triageHours": 24, "workaroundHours": 72, "fixHours": 168, "breaches": []},
        "nextActions": [],
    }


class Phase10BacklogEscalationTests(unittest.TestCase):
    @staticmethod
    def run_cli(
        input_path: Path,
        output_path: Path,
        markdown_path: Path | None = None,
        thresholds_path: Path | None = None,
    ) -> subprocess.CompletedProcess[str]:
    def run_cli(input_path: Path, output_path: Path, markdown_path: Path | None = None) -> subprocess.CompletedProcess[str]:
        command = [
            sys.executable,
            str(Path(__file__).with_name("phase10_backlog_escalation.py")),
            "--input",
            str(input_path),
            "--output",
            str(output_path),
        ]
        if markdown_path is not None:
            command.extend(["--markdown-output", str(markdown_path)])
        if thresholds_path is not None:
            command.extend(["--thresholds", str(thresholds_path)])
        return subprocess.run(command, check=False, capture_output=True, text=True)

    def test_evaluate_candidates_returns_empty_when_all_metrics_within_threshold(self) -> None:
        payload = _valid_governance_payload()
        candidates = escalation.evaluate_candidates(payload, escalation.DEFAULT_THRESHOLDS)
        self.assertEqual(candidates, [])

    def test_evaluate_candidates_detects_kpi_and_sla_deviation(self) -> None:
        payload = _valid_governance_payload()
        payload["kpis"]["adoptionLeadTimeHours"] = 32.0
        payload["kpis"]["printReproducibilityRate"] = 95.0
        payload["sla"]["breaches"] = [
            {
                "ticketId": "SUP-999",
                "stage": "triage",
                "elapsedHours": 48,
                "owner": "delivery",
                "note": "triage lag",
            }
        ]
        candidates = escalation.evaluate_candidates(payload, escalation.DEFAULT_THRESHOLDS)
        signals = {candidate["signal"] for candidate in candidates}
        self.assertIn("adoption_lead_time", signals)
        self.assertIn("print_reproducibility_rate", signals)
        self.assertIn("sla_breach_count", signals)

    def test_render_markdown_contains_candidate_lines(self) -> None:
        payload = _valid_governance_payload()
        output = escalation.build_output(
            payload,
            [
                {
                    "candidate_id": "2026-W15-01",
                    "summary": "導入時間が閾値を超過",
                    "metric": {"value": 30.0, "threshold": 24.0, "comparator": ">"},
                    "suggested_owner": "author",
                    "severity": "high",
                }
            ],
            escalation.DEFAULT_THRESHOLDS,
        )
        markdown = escalation.render_markdown(output)
        self.assertIn("Phase 10 Backlog Escalation Candidates", markdown)
        self.assertIn("2026-W15-01", markdown)

    def test_cli_writes_json_and_markdown(self) -> None:
        payload = _valid_governance_payload()
        payload["kpis"]["selfResolutionRate"] = 60.0

        with tempfile.TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "input.json"
            output_path = Path(tmp) / "candidates.json"
            markdown_path = Path(tmp) / "candidates.md"
            input_path.write_text(json.dumps(payload), encoding="utf-8")

            completed = self.run_cli(input_path, output_path, markdown_path)
            self.assertEqual(completed.returncode, 0, msg=completed.stderr)
            self.assertTrue(output_path.exists())
            self.assertTrue(markdown_path.exists())
            output = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertGreaterEqual(output["candidateCount"], 1)
            self.assertIn("OK: wrote escalation candidates", completed.stdout)

    def test_cli_applies_threshold_override(self) -> None:
        payload = _valid_governance_payload()
        payload["kpis"]["adoptionLeadTimeHours"] = 30.0

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            input_path = tmp_path / "input.json"
            output_path = tmp_path / "candidates.json"
            thresholds_path = tmp_path / "thresholds.json"
            input_path.write_text(json.dumps(payload), encoding="utf-8")
            thresholds_path.write_text(json.dumps({"max_adoption_lead_time_hours": 40.0}), encoding="utf-8")

            completed = self.run_cli(input_path, output_path, thresholds_path=thresholds_path)
            self.assertEqual(completed.returncode, 0, msg=completed.stderr)
            output = json.loads(output_path.read_text(encoding="utf-8"))
            signals = {candidate["signal"] for candidate in output["candidates"]}
            self.assertNotIn("adoption_lead_time", signals)


if __name__ == "__main__":
    unittest.main()
