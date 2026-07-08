from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import phase10_backlog_escalation as escalation
import phase10_governance_report as governance_report


def _valid_governance_payload() -> dict[str, object]:
    return {
        "schemaVersion": governance_report.SCHEMA_VERSION,
        "generatedAt": "2026-04-11T00:00:00Z",
        "week": {"label": "2026-W15", "startDate": "2026-04-06", "endDate": "2026-04-12"},
        "kpis": {
            "displacedDuplicationCount": 4,
            "canonDriftIncidentCount": 0,
            "tableChangeReviewLeadTimeHours": 20.0,
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

    def test_evaluate_candidates_flags_displaced_duplication_stalled(self) -> None:
        payload = _valid_governance_payload()
        payload["kpis"]["displacedDuplicationCount"] = 0
        candidates = escalation.evaluate_candidates(payload, escalation.DEFAULT_THRESHOLDS)
        signals = {candidate["signal"] for candidate in candidates}
        self.assertIn("displaced_duplication_stalled", signals)

    def test_evaluate_candidates_flags_canon_drift_incident_exceeded(self) -> None:
        payload = _valid_governance_payload()
        payload["kpis"]["canonDriftIncidentCount"] = 2
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
        self.assertIn("canon_drift_incident_exceeded", signals)
        self.assertIn("sla_breach_count", signals)

    def test_evaluate_candidates_flags_table_change_review_lead_time_exceeded(self) -> None:
        payload = _valid_governance_payload()
        payload["kpis"]["tableChangeReviewLeadTimeHours"] = 60.0
        candidates = escalation.evaluate_candidates(payload, escalation.DEFAULT_THRESHOLDS)
        signals = {candidate["signal"] for candidate in candidates}
        self.assertIn("table_change_review_lead_time_exceeded", signals)

    def test_render_markdown_contains_candidate_lines(self) -> None:
        payload = _valid_governance_payload()
        output = escalation.build_output(
            payload,
            [
                {
                    "candidate_id": "2026-W15-01",
                    "summary": "表変更のレビュー所要時間が閾値を超過した",
                    "metric": {"value": 60.0, "threshold": 48.0, "comparator": ">"},
                    "suggested_owner": "delivery",
                    "severity": "medium",
                }
            ],
            escalation.DEFAULT_THRESHOLDS,
        )
        markdown = escalation.render_markdown(output)
        self.assertIn("Phase 10 Backlog Escalation Candidates", markdown)
        self.assertIn("2026-W15-01", markdown)

    def test_cli_writes_json_and_markdown(self) -> None:
        payload = _valid_governance_payload()
        payload["kpis"]["canonDriftIncidentCount"] = 3

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
        payload["kpis"]["tableChangeReviewLeadTimeHours"] = 60.0

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            input_path = tmp_path / "input.json"
            output_path = tmp_path / "candidates.json"
            thresholds_path = tmp_path / "thresholds.json"
            input_path.write_text(json.dumps(payload), encoding="utf-8")
            thresholds_path.write_text(
                json.dumps({"max_table_change_review_lead_time_hours": 96.0}), encoding="utf-8"
            )

            completed = self.run_cli(input_path, output_path, thresholds_path=thresholds_path)
            self.assertEqual(completed.returncode, 0, msg=completed.stderr)
            output = json.loads(output_path.read_text(encoding="utf-8"))
            signals = {candidate["signal"] for candidate in output["candidates"]}
            self.assertNotIn("table_change_review_lead_time_exceeded", signals)
            # The override must actually reach evaluate_candidates()/build_output(),
            # not just be parsed and discarded (regression guard for a prior bug
            # where main() silently used DEFAULT_THRESHOLDS instead of the loaded
            # override for both evaluation and the recorded thresholds field).
            self.assertEqual(output["thresholds"]["max_table_change_review_lead_time_hours"], 96.0)


if __name__ == "__main__":
    unittest.main()
