from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from check_phase9_template_sync import parse_iso_date, read_header, validate_sync

BASE_HEADER = (
    "BenchmarkTable,RuleId,RuleSet,ConditionExpr,ActionExpr,Priority,EffectiveFrom,ExpiresAt,QueryExample,"
    "RelatedRequirement,RelatedTest,Owner,Notes"
)
BASE_ROW = (
    "RequirementsTraceability,REQ_TRACE_AUTH,ReqTrace,module=AUTH,link requirement,90,2026-04-03,2026-12-31,"
    "header=first&columns=A,B,C,Phase9-Template,phase9:test,author,ok"
)


class CheckPhase9TemplateSyncTests(unittest.TestCase):
    def test_read_header_returns_first_row(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "sample.csv"
            path.write_text("A,B,C\n1,2,3\n", encoding="utf-8")
            self.assertEqual(read_header(path), ["A", "B", "C"])

    def test_read_header_raises_on_empty_csv(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "empty.csv"
            path.write_text("", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "empty csv"):
                read_header(path)

    def test_validate_sync_returns_empty_errors_for_valid_pair(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            docs = Path(tmp) / "docs.csv"
            fixture = Path(tmp) / "fixture.csv"
            content = f"{BASE_HEADER}\n{BASE_ROW}\n"
            docs.write_text(content, encoding="utf-8")
            fixture.write_text(content, encoding="utf-8")

            self.assertEqual(validate_sync(docs, fixture), [])

    def test_validate_sync_detects_header_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            docs = Path(tmp) / "docs.csv"
            fixture = Path(tmp) / "fixture.csv"
            docs.write_text(f"{BASE_HEADER}\n{BASE_ROW}\n", encoding="utf-8")
            fixture.write_text("A,B,C\n1,2,3\n", encoding="utf-8")

            errors = validate_sync(docs, fixture)
            self.assertTrue(any("header mismatch" in error for error in errors))

    def test_validate_sync_detects_empty_required_column(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            docs = Path(tmp) / "docs.csv"
            fixture = Path(tmp) / "fixture.csv"
            docs.write_text(
                f"{BASE_HEADER}\nRequirementsTraceability,,ReqTrace,module=AUTH,link,90,2026-04-03,2026-12-31,"
                "header=first,Phase9-Template,phase9:test,author,missing id\n",
                encoding="utf-8",
            )
            fixture.write_text(f"{BASE_HEADER}\n{BASE_ROW}\n", encoding="utf-8")

            errors = validate_sync(docs, fixture)
            self.assertTrue(any("missing required column `RuleId`" in error for error in errors))

    def test_validate_sync_detects_duplicate_rule_id(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            docs = Path(tmp) / "docs.csv"
            fixture = Path(tmp) / "fixture.csv"
            docs.write_text(
                f"{BASE_HEADER}\n{BASE_ROW}\n"
                "StateTransition,REQ_TRACE_AUTH,StateFlow,state=REVIEW,move state,80,2026-04-03,2026-12-31,"
                "header=first,Phase9-Template,phase9:test,author,duplicate\n",
                encoding="utf-8",
            )
            fixture.write_text(f"{BASE_HEADER}\n{BASE_ROW}\n", encoding="utf-8")

            errors = validate_sync(docs, fixture)
            self.assertTrue(any("duplicate RuleId `REQ_TRACE_AUTH`" in error for error in errors))

    def test_validate_sync_detects_invalid_date_format(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            docs = Path(tmp) / "docs.csv"
            fixture = Path(tmp) / "fixture.csv"
            docs.write_text(
                f"{BASE_HEADER}\nRequirementsTraceability,REQ_TRACE_AUTH,ReqTrace,module=AUTH,link,90,2026/04/03,2026-12-31,"
                "header=first,Phase9-Template,phase9:test,author,bad date\n",
                encoding="utf-8",
            )
            fixture.write_text(f"{BASE_HEADER}\n{BASE_ROW}\n", encoding="utf-8")

            errors = validate_sync(docs, fixture)
            self.assertTrue(any("invalid date format" in error for error in errors))

    def test_validate_sync_detects_invalid_date_range(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            docs = Path(tmp) / "docs.csv"
            fixture = Path(tmp) / "fixture.csv"
            docs.write_text(
                f"{BASE_HEADER}\nRequirementsTraceability,REQ_TRACE_AUTH,ReqTrace,module=AUTH,link,90,2026-12-31,2026-04-03,"
                "header=first,Phase9-Template,phase9:test,author,bad range\n",
                encoding="utf-8",
            )
            fixture.write_text(f"{BASE_HEADER}\n{BASE_ROW}\n", encoding="utf-8")

            errors = validate_sync(docs, fixture)
            self.assertTrue(any("invalid date range" in error for error in errors))

    def test_validate_sync_detects_row_content_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            docs = Path(tmp) / "docs.csv"
            fixture = Path(tmp) / "fixture.csv"
            docs.write_text(f"{BASE_HEADER}\n{BASE_ROW}\n", encoding="utf-8")
            fixture.write_text(
                f"{BASE_HEADER}\nRequirementsTraceability,REQ_TRACE_AUTH,ReqTrace,module=AUTH,DIFFERENT ACTION,90,2026-04-03,2026-12-31,"
                "header=first&columns=A,B,C,Phase9-Template,phase9:test,author,ok\n",
                encoding="utf-8",
            )

            errors = validate_sync(docs, fixture)
            self.assertTrue(any("row mismatch" in error for error in errors))

    def test_validate_sync_can_ignore_row_order_when_option_enabled(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            docs = Path(tmp) / "docs.csv"
            fixture = Path(tmp) / "fixture.csv"
            docs.write_text(
                f"{BASE_HEADER}\n{BASE_ROW}\n"
                "StateTransition,STATE_REVIEW_TO_APPROVED,StateFlow,state=REVIEW,move state,80,2026-04-03,2026-12-31,"
                "header=first,Phase9-Template,phase9:test,author,ok\n",
                encoding="utf-8",
            )
            fixture.write_text(
                f"{BASE_HEADER}\n"
                "StateTransition,STATE_REVIEW_TO_APPROVED,StateFlow,state=REVIEW,move state,80,2026-04-03,2026-12-31,"
                "header=first,Phase9-Template,phase9:test,author,ok\n"
                f"{BASE_ROW}\n",
                encoding="utf-8",
            )

            strict_errors = validate_sync(docs, fixture)
            self.assertTrue(any("row mismatch" in error for error in strict_errors))

            relaxed_errors = validate_sync(docs, fixture, ignore_row_order=True)
            self.assertEqual(relaxed_errors, [])

    def test_parse_iso_date_rejects_nonexistent_calendar_day(self) -> None:
        self.assertIsNone(parse_iso_date("2026-13-01"))
        self.assertIsNone(parse_iso_date("2026-02-30"))
        self.assertIsNotNone(parse_iso_date("2026-02-28"))

    def test_cli_returns_zero_with_valid_docs_and_fixture_args(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            docs = Path(tmp) / "docs.csv"
            fixture = Path(tmp) / "fixture.csv"
            content = f"{BASE_HEADER}\n{BASE_ROW}\n"
            docs.write_text(content, encoding="utf-8")
            fixture.write_text(content, encoding="utf-8")

            command = [
                sys.executable,
                str(Path(__file__).with_name("check_phase9_template_sync.py")),
                "--docs",
                str(docs),
                "--fixture",
                str(fixture),
            ]
            completed = subprocess.run(command, check=False, capture_output=True, text=True)
            self.assertEqual(completed.returncode, 0)
            self.assertIn("phase9 template sync: OK", completed.stdout)

    def test_cli_returns_nonzero_when_quality_check_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            docs = Path(tmp) / "docs.csv"
            fixture = Path(tmp) / "fixture.csv"
            docs.write_text(
                f"{BASE_HEADER}\nRequirementsTraceability,REQ_TRACE_AUTH,ReqTrace,module=AUTH,link,90,2026-12-31,2026-04-03,"
                "header=first,Phase9-Template,phase9:test,author,bad range\n",
                encoding="utf-8",
            )
            fixture.write_text(f"{BASE_HEADER}\n{BASE_ROW}\n", encoding="utf-8")

            command = [
                sys.executable,
                str(Path(__file__).with_name("check_phase9_template_sync.py")),
                "--docs",
                str(docs),
                "--fixture",
                str(fixture),
            ]
            completed = subprocess.run(command, check=False, capture_output=True, text=True)
            self.assertEqual(completed.returncode, 1)
            self.assertIn("phase9 template sync: NG", completed.stdout)

    def test_cli_accepts_ignore_row_order_option(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            docs = Path(tmp) / "docs.csv"
            fixture = Path(tmp) / "fixture.csv"
            docs.write_text(
                f"{BASE_HEADER}\n{BASE_ROW}\n"
                "StateTransition,STATE_REVIEW_TO_APPROVED,StateFlow,state=REVIEW,move state,80,2026-04-03,2026-12-31,"
                "header=first,Phase9-Template,phase9:test,author,ok\n",
                encoding="utf-8",
            )
            fixture.write_text(
                f"{BASE_HEADER}\n"
                "StateTransition,STATE_REVIEW_TO_APPROVED,StateFlow,state=REVIEW,move state,80,2026-04-03,2026-12-31,"
                "header=first,Phase9-Template,phase9:test,author,ok\n"
                f"{BASE_ROW}\n",
                encoding="utf-8",
            )

            command = [
                sys.executable,
                str(Path(__file__).with_name("check_phase9_template_sync.py")),
                "--docs",
                str(docs),
                "--fixture",
                str(fixture),
                "--ignore-row-order",
            ]
            completed = subprocess.run(command, check=False, capture_output=True, text=True)
            self.assertEqual(completed.returncode, 0)
            self.assertIn("phase9 template sync: OK", completed.stdout)

    def test_cli_returns_nonzero_when_input_files_are_missing(self) -> None:
        command = [
            sys.executable,
            str(Path(__file__).with_name("check_phase9_template_sync.py")),
            "--docs",
            "does-not-exist.csv",
            "--fixture",
            "does-not-exist-too.csv",
        ]
        completed = subprocess.run(command, check=False, capture_output=True, text=True)
        self.assertEqual(completed.returncode, 1)
        self.assertIn("phase9 template sync: NG", completed.stdout)

    def test_cli_json_output_for_success(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            docs = Path(tmp) / "docs.csv"
            fixture = Path(tmp) / "fixture.csv"
            content = f"{BASE_HEADER}\n{BASE_ROW}\n"
            docs.write_text(content, encoding="utf-8")
            fixture.write_text(content, encoding="utf-8")

            command = [
                sys.executable,
                str(Path(__file__).with_name("check_phase9_template_sync.py")),
                "--docs",
                str(docs),
                "--fixture",
                str(fixture),
                "--format",
                "json",
            ]
            completed = subprocess.run(command, check=False, capture_output=True, text=True)
            payload = json.loads(completed.stdout)
            self.assertEqual(completed.returncode, 0)
            self.assertEqual(payload["status"], "ok")
            self.assertEqual(payload["errors"], [])
            self.assertIn("BenchmarkTable", payload["header"])

    def test_cli_json_output_accepts_ignore_row_order_option(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            docs = Path(tmp) / "docs.csv"
            fixture = Path(tmp) / "fixture.csv"
            docs.write_text(
                f"{BASE_HEADER}\n{BASE_ROW}\n"
                "StateTransition,STATE_REVIEW_TO_APPROVED,StateFlow,state=REVIEW,move state,80,2026-04-03,2026-12-31,"
                "header=first,Phase9-Template,phase9:test,author,ok\n",
                encoding="utf-8",
            )
            fixture.write_text(
                f"{BASE_HEADER}\n"
                "StateTransition,STATE_REVIEW_TO_APPROVED,StateFlow,state=REVIEW,move state,80,2026-04-03,2026-12-31,"
                "header=first,Phase9-Template,phase9:test,author,ok\n"
                f"{BASE_ROW}\n",
                encoding="utf-8",
            )

            command = [
                sys.executable,
                str(Path(__file__).with_name("check_phase9_template_sync.py")),
                "--docs",
                str(docs),
                "--fixture",
                str(fixture),
                "--ignore-row-order",
                "--format",
                "json",
            ]
            completed = subprocess.run(command, check=False, capture_output=True, text=True)
            payload = json.loads(completed.stdout)
            self.assertEqual(completed.returncode, 0)
            self.assertEqual(payload["status"], "ok")
            self.assertEqual(payload["errors"], [])

    def test_cli_json_output_ignore_row_order_still_detects_content_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            docs = Path(tmp) / "docs.csv"
            fixture = Path(tmp) / "fixture.csv"
            docs.write_text(
                f"{BASE_HEADER}\n{BASE_ROW}\n"
                "StateTransition,STATE_REVIEW_TO_APPROVED,StateFlow,state=REVIEW,move state,80,2026-04-03,2026-12-31,"
                "header=first,Phase9-Template,phase9:test,author,ok\n",
                encoding="utf-8",
            )
            fixture.write_text(
                f"{BASE_HEADER}\n"
                "StateTransition,STATE_REVIEW_TO_APPROVED,StateFlow,state=REVIEW,DIFFERENT ACTION,80,2026-04-03,2026-12-31,"
                "header=first,Phase9-Template,phase9:test,author,ok\n"
                f"{BASE_ROW}\n",
                encoding="utf-8",
            )

            command = [
                sys.executable,
                str(Path(__file__).with_name("check_phase9_template_sync.py")),
                "--docs",
                str(docs),
                "--fixture",
                str(fixture),
                "--ignore-row-order",
                "--format",
                "json",
            ]
            completed = subprocess.run(command, check=False, capture_output=True, text=True)
            payload = json.loads(completed.stdout)
            self.assertEqual(completed.returncode, 1)
            self.assertEqual(payload["status"], "ng")
            self.assertTrue(any("row mismatch" in error for error in payload["errors"]))

    def test_cli_json_output_for_failure(self) -> None:
        command = [
            sys.executable,
            str(Path(__file__).with_name("check_phase9_template_sync.py")),
            "--docs",
            "does-not-exist.csv",
            "--fixture",
            "does-not-exist-too.csv",
            "--format",
            "json",
        ]
        completed = subprocess.run(command, check=False, capture_output=True, text=True)
        payload = json.loads(completed.stdout)
        self.assertEqual(completed.returncode, 1)
        self.assertEqual(payload["status"], "ng")
        self.assertGreaterEqual(len(payload["errors"]), 1)


if __name__ == "__main__":
    unittest.main()
