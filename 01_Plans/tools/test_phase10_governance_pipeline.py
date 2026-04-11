from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import phase10_governance_pipeline as pipeline


class Phase10GovernancePipelineTests(unittest.TestCase):
    @staticmethod
    def run_cli(gate_inputs: list[Path], decisions_path: Path, output_dir: Path) -> subprocess.CompletedProcess[str]:
        command = [
            sys.executable,
            str(Path(__file__).with_name("phase10_governance_pipeline.py")),
            "--gate-inputs",
            *[str(path) for path in gate_inputs],
            "--decisions",
            str(decisions_path),
            "--output-dir",
            str(output_dir),
        ]
        return subprocess.run(command, check=False, capture_output=True, text=True)

    def test_run_pipeline_generates_all_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            gate_input = tmp_path / "unit.json"
            gate_input.write_text(
                json.dumps(
                    {
                        "source": "unit",
                        "gate": "unit",
                        "status": "fail",
                        "failure_category": "query",
                        "impact_persona": "reviewer",
                    }
                ),
                encoding="utf-8",
            )
            decisions = tmp_path / "decisions.json"
            decisions.write_text(
                json.dumps(
                    [
                        {
                            "candidate_id": "auto-generated-01",
                            "decision": "escalate",
                            "priority": "high",
                            "owner": "reviewer",
                            "note": "",
                        }
                    ]
                ),
                encoding="utf-8",
            )

            out = tmp_path / "artifacts"
            outputs = pipeline.run_pipeline(gate_inputs=[gate_input], decisions_path=decisions, output_dir=out)

            self.assertEqual(len(outputs), 11)
            for path in outputs.values():
                self.assertTrue(path.exists(), msg=str(path))

    def test_cli_reports_failure_for_unknown_candidate(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            gate_input = tmp_path / "docs.json"
            gate_input.write_text(
                json.dumps({"source": "docs-check", "gate": "docs-check", "status": "pass"}),
                encoding="utf-8",
            )
            decisions = tmp_path / "decisions.json"
            decisions.write_text(
                json.dumps(
                    [
                        {
                            "candidate_id": "missing-id",
                            "decision": "escalate",
                            "priority": "high",
                            "owner": "delivery",
                            "note": "",
                        }
                    ]
                ),
                encoding="utf-8",
            )

            completed = self.run_cli([gate_input], decisions, tmp_path / "out")
            self.assertEqual(completed.returncode, 1)
            self.assertIn("NG:", completed.stdout)


if __name__ == "__main__":
    unittest.main()
