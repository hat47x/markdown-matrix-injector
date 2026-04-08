from __future__ import annotations

import json
import subprocess
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
    evaluate_phase9_sync_gate,
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

    @patch("release_gate_check.run_command")
    def test_evaluate_test_gate_success_message_mentions_unit_lane(self, run_command_mock) -> None:
        run_command_mock.return_value = CompletedProcess(args=[], returncode=0, stdout="", stderr="")
        result = evaluate_test_gate(Path("."), timeout_sec=1, skip_tests=False)
        self.assertTrue(result.passed)
        self.assertEqual(result.detail, "npm run test:unit passed")

    @patch("release_gate_check.evaluate_test_gate")
    @patch("release_gate_check.evaluate_phase9_sync_gate")
    @patch("release_gate_check.evaluate_planning_gate")
    def test_run_release_gates_keeps_gate_order(self, planning_mock, phase9_mock, test_mock) -> None:
        planning_mock.return_value = GateResult("G1:Planning", True, "ok")
        test_mock.return_value = GateResult("G2:Tests", True, "ok")
        phase9_mock.return_value = GateResult("G3:Phase9Sync", True, "ok")

        results = run_release_gates(
            Path("."),
            allow_pending_issues=False,
            planning_timeout_sec=1,
            npm_test_timeout_sec=1,
            skip_tests=False,
            phase9_ignore_row_order=False,
        )

        self.assertEqual([item.gate for item in results], ["G1:Planning", "G2:Tests", "G3:Phase9Sync"])

    @patch("release_gate_check.evaluate_test_gate")
    @patch("release_gate_check.evaluate_phase9_sync_gate")
    @patch("release_gate_check.evaluate_planning_gate")
    def test_run_release_gates_forwards_ignore_row_order_flag(self, planning_mock, phase9_mock, test_mock) -> None:
        planning_mock.return_value = GateResult("G1:Planning", True, "ok")
        test_mock.return_value = GateResult("G2:Tests", True, "ok")
        phase9_mock.return_value = GateResult("G3:Phase9Sync", True, "ok")

        run_release_gates(
            Path("."),
            allow_pending_issues=False,
            planning_timeout_sec=1,
            npm_test_timeout_sec=1,
            skip_tests=False,
            phase9_ignore_row_order=True,
        )

        phase9_mock.assert_called_once_with(Path("."), 1, False, True)

    @patch("release_gate_check.run_command")
    def test_evaluate_phase9_sync_gate_skip(self, run_command_mock) -> None:
        result = evaluate_phase9_sync_gate(Path("."), timeout_sec=1, skip_tests=True, ignore_row_order=False)
        self.assertTrue(result.passed)
        self.assertEqual(result.detail, "skipped by --skip-tests")
        self.assertNotIn("ignore-row-order", result.detail)
        run_command_mock.assert_not_called()

    @patch("release_gate_check.run_command")
    def test_evaluate_phase9_sync_gate_skip_mentions_unapplied_ignore_row_order(self, run_command_mock) -> None:
        result = evaluate_phase9_sync_gate(Path("."), timeout_sec=1, skip_tests=True, ignore_row_order=True)
        self.assertTrue(result.passed)
        self.assertIn("ignore-row-order not evaluated", result.detail)
        run_command_mock.assert_not_called()

    @patch("release_gate_check.run_command")
    def test_evaluate_phase9_sync_gate_success_with_json_ok(self, run_command_mock) -> None:
        run_command_mock.return_value = CompletedProcess(args=[], returncode=0, stdout='{"status":"ok"}', stderr="")
        result = evaluate_phase9_sync_gate(Path("."), timeout_sec=1, skip_tests=False, ignore_row_order=False)
        self.assertTrue(result.passed)
        self.assertEqual(result.detail, "phase9 sync checker passed")

    @patch("release_gate_check.run_command")
    def test_evaluate_phase9_sync_gate_fails_when_status_ng(self, run_command_mock) -> None:
        run_command_mock.return_value = CompletedProcess(args=[], returncode=0, stdout='{"status":"ng"}', stderr="")
        result = evaluate_phase9_sync_gate(Path("."), timeout_sec=1, skip_tests=False, ignore_row_order=False)
        self.assertFalse(result.passed)
        self.assertIn("status is `ng`", result.detail)

    @patch("release_gate_check.run_command")
    def test_evaluate_phase9_sync_gate_fails_when_json_invalid(self, run_command_mock) -> None:
        run_command_mock.return_value = CompletedProcess(args=[], returncode=0, stdout="{not-json", stderr="")
        result = evaluate_phase9_sync_gate(Path("."), timeout_sec=1, skip_tests=False, ignore_row_order=False)
        self.assertFalse(result.passed)
        self.assertIn("json parse failed", result.detail)

    @patch("release_gate_check.run_command")
    def test_evaluate_phase9_sync_gate_surfaces_checker_failure_output(self, run_command_mock) -> None:
        run_command_mock.return_value = CompletedProcess(
            args=[],
            returncode=1,
            stdout="phase9 template sync: NG\n- row mismatch",
            stderr="",
        )
        result = evaluate_phase9_sync_gate(Path("."), timeout_sec=1, skip_tests=False, ignore_row_order=False)
        self.assertFalse(result.passed)
        self.assertIn("phase9 template sync: NG", result.detail)
        self.assertIn("row mismatch", result.detail)

    @patch("release_gate_check.run_command")
    def test_evaluate_phase9_sync_gate_fails_when_status_missing(self, run_command_mock) -> None:
        run_command_mock.return_value = CompletedProcess(args=[], returncode=0, stdout='{"header":[]}', stderr="")
        result = evaluate_phase9_sync_gate(Path("."), timeout_sec=1, skip_tests=False, ignore_row_order=False)
        self.assertFalse(result.passed)
        self.assertIn("status is `unknown`", result.detail)

    @patch("release_gate_check.run_command")
    def test_evaluate_phase9_sync_gate_passes_ignore_row_order_option(self, run_command_mock) -> None:
        run_command_mock.return_value = CompletedProcess(args=[], returncode=0, stdout='{"status":"ok"}', stderr="")
        result = evaluate_phase9_sync_gate(Path("."), timeout_sec=1, skip_tests=False, ignore_row_order=True)
        self.assertTrue(result.passed)
        self.assertIn("ignore-row-order", result.detail)
        invoked_command = run_command_mock.call_args.args[0]
        self.assertIn("--ignore-row-order", invoked_command)

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

    def test_cli_json_output_accepts_phase9_ignore_row_order_flag(self) -> None:
        command = [
            sys.executable,
            str(Path(__file__).with_name("release_gate_check.py")),
            "--skip-tests",
            "--phase9-ignore-row-order",
            "--format",
            "json",
        ]
        completed = subprocess.run(command, check=False, capture_output=True, text=True)
        payload = json.loads(completed.stdout)
        self.assertEqual(completed.returncode, 0)
        self.assertEqual([item["gate"] for item in payload], ["G1:Planning", "G2:Tests", "G3:Phase9Sync"])
        phase9_gate = next(item for item in payload if item["gate"] == "G3:Phase9Sync")
        self.assertEqual(
            phase9_gate["detail"],
            "skipped by --skip-tests (ignore-row-order not evaluated)",
        )
        self.assertIn("ignore-row-order not evaluated", phase9_gate["detail"])
        self.assertNotEqual(phase9_gate["detail"], "skipped by --skip-tests")

    def test_cli_json_output_skip_tests_uses_strict_phase9_skip_detail_by_default(self) -> None:
        command = [
            sys.executable,
            str(Path(__file__).with_name("release_gate_check.py")),
            "--skip-tests",
            "--format",
            "json",
        ]
        completed = subprocess.run(command, check=False, capture_output=True, text=True)
        payload = json.loads(completed.stdout)
        self.assertEqual(completed.returncode, 0)
        phase9_gate = next(item for item in payload if item["gate"] == "G3:Phase9Sync")
        self.assertEqual(phase9_gate["detail"], "skipped by --skip-tests")
        self.assertNotIn("ignore-row-order", phase9_gate["detail"])


if __name__ == "__main__":
    unittest.main()
