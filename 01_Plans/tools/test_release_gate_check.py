from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
import sys
from subprocess import CompletedProcess, TimeoutExpired
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

from release_gate_check import (  # noqa: E402
    GateResult,
    evaluate_planning_gate,
    evaluate_planning_summary,
    ensure_trailing_newline,
    evaluate_test_gate,
    run_command,
    run_release_gates,
    build_markdown_report,
    serialize_results,
    write_output_file,
)


class ReleaseGateCheckTests(unittest.TestCase):
    def test_evaluate_planning_summary_pass(self) -> None:
        result = evaluate_planning_summary({"issue_orphan": 0, "issue_pending": 0}, False)
        self.assertEqual(result, GateResult("G1:Planning", True, "orphan=0, pending=0"))

    def test_evaluate_planning_summary_fail_orphan(self) -> None:
        result = evaluate_planning_summary({"issue_orphan": 2, "issue_pending": 0}, False)
        self.assertFalse(result.passed)
        self.assertIn("orphan issues detected", result.detail)

    def test_evaluate_planning_summary_allow_pending(self) -> None:
        result = evaluate_planning_summary({"issue_orphan": 0, "issue_pending": 3}, True)
        self.assertTrue(result.passed)
        self.assertIn("pending allowed", result.detail)

    @patch("release_gate_check.run_command")
    def test_evaluate_planning_gate_reports_json_parse_failure(self, run_command_mock) -> None:
        run_command_mock.return_value = CompletedProcess(args=[], returncode=0, stdout="not-json", stderr="")
        result = evaluate_planning_gate(Path("."), allow_pending_issues=False, timeout_sec=1)
        self.assertFalse(result.passed)
        self.assertIn("json parse failed", result.detail)

    @patch("release_gate_check.run_command")
    def test_evaluate_planning_gate_reports_missing_summary(self, run_command_mock) -> None:
        run_command_mock.return_value = CompletedProcess(args=[], returncode=0, stdout="{}", stderr="")
        result = evaluate_planning_gate(Path("."), allow_pending_issues=False, timeout_sec=1)
        self.assertFalse(result.passed)
        self.assertIn("missing summary", result.detail)

    @patch("release_gate_check.run_command")
    def test_evaluate_test_gate_surfaces_failure_tail(self, run_command_mock) -> None:
        run_command_mock.return_value = CompletedProcess(
            args=[],
            returncode=1,
            stdout="line1\nline2",
            stderr="line3\nline4",
        )
        result = evaluate_test_gate(Path("."), timeout_sec=1, skip_tests=False)
        self.assertFalse(result.passed)
        self.assertIn("line4", result.detail)

    def test_evaluate_test_gate_skip(self) -> None:
        result = evaluate_test_gate(Path("."), timeout_sec=1, skip_tests=True)
        self.assertTrue(result.passed)
        self.assertIn("--skip-tests", result.detail)

    @patch("release_gate_check.evaluate_test_gate")
    @patch("release_gate_check.evaluate_planning_gate")
    def test_run_release_gates_keeps_gate_order(self, planning_mock, test_mock) -> None:
        planning_mock.return_value = GateResult("G1:Planning", True, "ok")
        test_mock.return_value = GateResult("G2:Tests", True, "ok")

        results = run_release_gates(
            Path("."),
            allow_pending_issues=False,
            planning_timeout_sec=1,
            npm_test_timeout_sec=1,
            skip_tests=False,
        )

        self.assertEqual([item.gate for item in results], ["G1:Planning", "G2:Tests"])

    @patch("release_gate_check.subprocess.run")
    def test_run_command_timeout(self, subprocess_run_mock) -> None:
        subprocess_run_mock.side_effect = TimeoutExpired(cmd=["npm", "test"], timeout=1)
        proc = run_command(["npm", "test"], Path("."), timeout_sec=1)
        self.assertEqual(proc.returncode, 124)
        self.assertIn("timeout", proc.stderr)

    def test_run_command_command_not_found(self) -> None:
        proc = run_command(["__command_not_found__"], Path("."), timeout_sec=1)
        self.assertEqual(proc.returncode, 127)
        self.assertIn("command not found", proc.stderr)


    def test_serialize_results_is_json_array(self) -> None:
        payload = serialize_results([GateResult("G1:Planning", True, "ok")])
        parsed = json.loads(payload)
        self.assertEqual(parsed[0]["gate"], "G1:Planning")

    def test_build_markdown_report_contains_gate_status(self) -> None:
        report = build_markdown_report([GateResult("G1:Planning", True, "ok")])
        self.assertIn("# Release Gate Report", report)
        self.assertIn("**G1:Planning**: PASS", report)

    def test_ensure_trailing_newline_normalizes_once(self) -> None:
        self.assertEqual(ensure_trailing_newline("abc"), "abc\n")
        self.assertEqual(ensure_trailing_newline("abc\n"), "abc\n")

    def test_write_output_file_supports_relative_path(self) -> None:
        payload = "[{}]"
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp)
            write_output_file("artifacts/release-gate.json", payload, repo_root)
            out = repo_root / "artifacts" / "release-gate.json"
            self.assertTrue(out.exists())
            self.assertEqual(out.read_text(encoding="utf-8"), "[{}]\n")


if __name__ == "__main__":
    unittest.main()
