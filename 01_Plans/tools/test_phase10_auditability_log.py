from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import phase10_auditability_log as audit


def _candidate_payload() -> dict[str, object]:
    return {
        "candidates": [
            {"candidate_id": "2026-W15-01", "signal": "sla_breach_count", "summary": "SLA breach が検出された"},
            {"candidate_id": "2026-W15-02", "signal": "self_resolution_rate", "summary": "自己解決率が低下"},
        ]
    }


class Phase10AuditabilityLogTests(unittest.TestCase):
    @staticmethod
    def run_cli(candidates_path: Path, decisions_path: Path, output_path: Path, markdown_path: Path | None = None) -> subprocess.CompletedProcess[str]:
        command = [
            sys.executable,
            str(Path(__file__).with_name("phase10_auditability_log.py")),
            "--candidates",
            str(candidates_path),
            "--decisions",
            str(decisions_path),
            "--output",
            str(output_path),
        ]
        if markdown_path is not None:
            command.extend(["--markdown-output", str(markdown_path)])
        return subprocess.run(command, check=False, capture_output=True, text=True)

    def test_build_audit_log_maps_decisions_to_candidates(self) -> None:
        candidates = {"2026-W15-01": {"signal": "sla_breach_count", "summary": "SLA breach が検出された"}}
        decisions = [
            {
                "candidate_id": "2026-W15-01",
                "decision": "defer",
                "priority": "high",
                "owner": "delivery",
                "note": "ops freeze window",
            }
        ]
        payload = audit.build_audit_log(candidates_by_id=candidates, decisions=decisions, decided_at="2026-04-11T00:00:00Z")
        self.assertEqual(payload["entryCount"], 1)
        self.assertEqual(payload["entries"][0]["deferred_reason"], "ops freeze window")

    def test_parse_decisions_requires_defer_reason(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "decisions.json"
            path.write_text(
                json.dumps(
                    [
                        {
                            "candidate_id": "2026-W15-01",
                            "decision": "defer",
                            "priority": "medium",
                            "owner": "reviewer",
                            "note": "",
                        }
                    ]
                ),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(audit.ValidationError, "note is required"):
                audit.parse_decisions(path)

    def test_cli_writes_json_and_markdown(self) -> None:
        decisions = [
            {
                "candidate_id": "2026-W15-01",
                "decision": "escalate",
                "priority": "high",
                "owner": "delivery",
                "note": "",
            }
        ]
        with tempfile.TemporaryDirectory() as tmp:
            candidates_path = Path(tmp) / "candidates.json"
            decisions_path = Path(tmp) / "decisions.json"
            output_path = Path(tmp) / "audit-log.json"
            markdown_path = Path(tmp) / "audit-log.md"
            candidates_path.write_text(json.dumps(_candidate_payload()), encoding="utf-8")
            decisions_path.write_text(json.dumps(decisions), encoding="utf-8")

            completed = self.run_cli(candidates_path, decisions_path, output_path, markdown_path)
            self.assertEqual(completed.returncode, 0, msg=completed.stderr)
            self.assertTrue(output_path.exists())
            self.assertTrue(markdown_path.exists())
            payload = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(payload["entryCount"], 1)
            self.assertIn("OK: wrote auditability log", completed.stdout)


if __name__ == "__main__":
    unittest.main()
