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
    def run_cli(
        gate_inputs: list[Path],
        decisions_path: Path,
        output_dir: Path,
        manual_kpis_path: Path | None = None,
    ) -> subprocess.CompletedProcess[str]:
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
        if manual_kpis_path is not None:
            command.extend(["--manual-kpis-file", str(manual_kpis_path)])
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

    def test_run_pipeline_forwards_manual_kpis_into_governance_report(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            gate_input = tmp_path / "unit.json"
            gate_input.write_text(
                json.dumps({"source": "unit", "gate": "unit", "status": "pass"}),
                encoding="utf-8",
            )
            decisions = tmp_path / "decisions.json"
            decisions.write_text(json.dumps([]), encoding="utf-8")
            manual_kpis_path = tmp_path / "manual-kpis.json"
            manual_kpis_path.write_text(
                json.dumps(
                    {
                        "displacedDuplicationCount": 6,
                        "canonDriftIncidentCount": 1,
                        "tableChangeReviewLeadTimeHours": 20.25,
                    }
                ),
                encoding="utf-8",
            )

            out = tmp_path / "artifacts"
            outputs = pipeline.run_pipeline(
                gate_inputs=[gate_input],
                decisions_path=decisions,
                output_dir=out,
                manual_kpis_path=manual_kpis_path,
            )

            self.assertEqual(len(outputs), 11)
            report_markdown = outputs["governance_report"].read_text(encoding="utf-8")
            self.assertIn("| Displaced copy-paste duplication (count) | 6 |", report_markdown)
            self.assertIn("| Canon-vs-document drift incidents (count) | 1 |", report_markdown)
            self.assertIn("| Table-change review lead time (hours) | 20.2 |", report_markdown)

    def test_cli_forwards_manual_kpis_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            gate_input = tmp_path / "unit.json"
            gate_input.write_text(
                json.dumps({"source": "unit", "gate": "unit", "status": "pass"}),
                encoding="utf-8",
            )
            decisions = tmp_path / "decisions.json"
            decisions.write_text(json.dumps([]), encoding="utf-8")
            manual_kpis_path = tmp_path / "manual-kpis.json"
            manual_kpis_path.write_text(
                json.dumps({"displacedDuplicationCount": 6}),
                encoding="utf-8",
            )

            completed = self.run_cli(
                [gate_input], decisions, tmp_path / "out", manual_kpis_path=manual_kpis_path
            )

            self.assertEqual(completed.returncode, 0, msg=completed.stdout + completed.stderr)
            seed = json.loads((tmp_path / "out" / "phase10-governance-seed.json").read_text(encoding="utf-8"))
            self.assertEqual(seed["kpis"]["displacedDuplicationCount"], 6)
            self.assertEqual(seed["kpisProvenance"]["displacedDuplicationCount"], "manual")

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
