from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import phase10_evidence_harvest as harvest
import phase10_governance_report as governance_report


class Phase10EvidenceHarvestTests(unittest.TestCase):
    @staticmethod
    def run_cli(
        inputs: list[Path],
        output_path: Path | None = None,
        governance_output_path: Path | None = None,
    ) -> subprocess.CompletedProcess[str]:
        command = [
            sys.executable,
            str(Path(__file__).with_name("phase10_evidence_harvest.py")),
            "--inputs",
            *[str(path) for path in inputs],
        ]
        if output_path is not None:
            command.extend(["--output", str(output_path)])
        if governance_output_path is not None:
            command.extend(["--governance-output", str(governance_output_path)])
        return subprocess.run(command, check=False, capture_output=True, text=True)

    def test_parse_records_applies_default_failure_and_persona(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "gate.json"
            input_path.write_text(
                json.dumps({"source": "unit", "gate": "unit", "status": "pass"}),
                encoding="utf-8",
            )

            records = harvest.parse_records(input_path, collected_at="2026-04-11T00:00:00Z")

        self.assertEqual(records[0]["failure_category"], "unknown")
        self.assertEqual(records[0]["impact_persona"], "reviewer")
        self.assertEqual(records[0]["collected_at"], "2026-04-11T00:00:00Z")

    def test_harvest_merges_multiple_inputs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            first = Path(tmp) / "docs.json"
            second = Path(tmp) / "integration.json"
            first.write_text(
                json.dumps({"source": "docs-check", "gate": "docs-check", "status": "pass"}),
                encoding="utf-8",
            )
            second.write_text(
                json.dumps(
                    [
                        {
                            "source": "integration",
                            "gate": "integration",
                            "status": "fail",
                            "failure_category": "query",
                            "impact_persona": "author",
                        }
                    ]
                ),
                encoding="utf-8",
            )

            artifact = harvest.harvest([first, second], collected_at="2026-04-11T01:00:00Z")

        self.assertEqual(artifact["recordCount"], 2)
        self.assertEqual(artifact["schemaVersion"], "phase10-evidence-harvest/v1")
        self.assertEqual(artifact["records"][0]["failure_category"], "unknown")
        self.assertEqual(artifact["records"][1]["failure_category"], "query")

    def test_parse_records_rejects_unknown_gate(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "gate.json"
            input_path.write_text(
                json.dumps({"source": "foo", "gate": "lint", "status": "pass"}),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(harvest.ValidationError, "must be one of"):
                harvest.parse_records(input_path, collected_at="2026-04-11T00:00:00Z")

    def test_cli_writes_artifact(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "phase9-sync.json"
            output_path = Path(tmp) / "harvest.json"
            input_path.write_text(
                json.dumps(
                    {
                        "source": "phase9-sync",
                        "gate": "phase9-sync",
                        "status": "pass",
                        "failure_category": "render",
                        "impact_persona": "delivery",
                    }
                ),
                encoding="utf-8",
            )

            completed = self.run_cli([input_path], output_path)

            self.assertEqual(completed.returncode, 0, msg=completed.stderr)
            self.assertIn("OK: wrote evidence harvest artifact", completed.stdout)
            payload = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(payload["recordCount"], 1)
            self.assertEqual(payload["records"][0]["impact_persona"], "delivery")
            self.assertEqual(payload["records"][0]["status"], "pass")

    def test_cli_writes_default_query_evidence_path_and_governance_seed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            workdir = Path(tmp)
            input_path = workdir / "unit.json"
            governance_output = workdir / "governance-seed.json"
            input_path.write_text(
                json.dumps({"source": "unit", "gate": "unit", "status": "PASS"}),
                encoding="utf-8",
            )

            completed = subprocess.run(
                [
                    sys.executable,
                    str(Path(__file__).with_name("phase10_evidence_harvest.py")),
                    "--inputs",
                    str(input_path),
                    "--governance-output",
                    str(governance_output),
                ],
                check=False,
                capture_output=True,
                text=True,
                cwd=workdir,
            )

            self.assertEqual(completed.returncode, 0, msg=completed.stderr)
            self.assertIn("OK: wrote governance seed", completed.stdout)
            harvest_outputs = list((workdir / "query-evidence").glob("phase10-evidence-harvest-*.json"))
            self.assertEqual(len(harvest_outputs), 1)
            self.assertTrue(governance_output.exists())

    def test_minimum_integration_with_governance_report_contract(self) -> None:
        artifact = {
            "generatedAt": "2026-04-11T02:00:00Z",
            "recordCount": 2,
            "records": [
                {
                    "source": "docs-check",
                    "gate": "docs-check",
                    "status": "pass",
                    "failure_category": "unknown",
                    "impact_persona": "reviewer",
                    "collected_at": "2026-04-11T02:00:00Z",
                },
                {
                    "source": "integration",
                    "gate": "integration",
                    "status": "fail",
                    "failure_category": "render",
                    "impact_persona": "delivery",
                    "collected_at": "2026-04-11T02:00:00Z",
                },
            ],
        }

        governance_payload = harvest.build_governance_seed(artifact)

        with tempfile.TemporaryDirectory() as tmp:
            payload_path = Path(tmp) / "governance-input.json"
            payload_path.write_text(json.dumps(governance_payload), encoding="utf-8")
            parsed = governance_report.parse_input(payload_path)

        self.assertEqual(parsed["week"]["label"], "auto-generated")
        self.assertIn("kpis", parsed)


if __name__ == "__main__":
    unittest.main()
