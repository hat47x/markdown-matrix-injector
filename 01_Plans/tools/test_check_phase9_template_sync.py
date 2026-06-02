from __future__ import annotations

import json
import io
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

import check_phase9_template_sync as phase9_sync
from check_phase9_template_sync import (
    DuplicateHeaderError,
    EmptyCsvError,
    JSON_SCHEMA_VERSION,
    MissingHeaderNameError,
    classify_exception_code,
    dedupe_preserving_order,
    format_cli_exception,
    normalize_header_cells,
    parse_iso_date,
    read_header,
    read_rows,
    read_rows_with_header,
    validate_sync,
    validate_quality_rows,
    validate_sync_with_header,
)

BASE_HEADER = (
    "BenchmarkTable,RuleId,RuleSet,ConditionExpr,ActionExpr,Priority,EffectiveFrom,ExpiresAt,QueryExample,"
    "RelatedRequirement,RelatedTest,Owner,Notes"
)
BASE_ROW = (
    "RequirementsTraceability,REQ_TRACE_AUTH,ReqTrace,module=AUTH,link requirement,90,2026-04-03,2026-12-31,"
    "header=first&columns=A,B,C,Phase9-Template,phase9:test,author,ok"
)


class CheckPhase9TemplateSyncTests(unittest.TestCase):
    @staticmethod
    def run_sync_cli(
        docs: Path | str,
        fixture: Path | str,
        *,
        output_format: str = "text",
        ignore_row_order: bool = False,
    ) -> subprocess.CompletedProcess[str]:
        command = [
            sys.executable,
            str(Path(__file__).with_name("check_phase9_template_sync.py")),
            "--docs",
            str(docs),
            "--fixture",
            str(fixture),
        ]
        if ignore_row_order:
            command.append("--ignore-row-order")
        if output_format != "text":
            command.extend(["--format", output_format])
        return subprocess.run(command, check=False, capture_output=True, text=True)

    @staticmethod
    def parse_json_stdout(completed: subprocess.CompletedProcess[str]) -> dict[str, object]:
        return json.loads(completed.stdout)

    def assert_json_contract_basics(self, payload: dict[str, object], expected_status: str) -> None:
        self.assertEqual(payload["schemaVersion"], JSON_SCHEMA_VERSION)
        self.assertEqual(payload["status"], expected_status)
        self.assertIsInstance(payload["errors"], list)
        self.assertIsInstance(payload["errorCodes"], list)
        self.assertIsInstance(payload["errorCodeSummary"], list)
        self.assertEqual(payload["errorCount"], len(payload["errors"]))

    def test_format_cli_exception_returns_stable_empty_csv_message(self) -> None:
        error = EmptyCsvError("empty csv: /tmp/empty.csv")
        self.assertEqual(format_cli_exception(error), "input csv is empty: /tmp/empty.csv")

    def test_format_cli_exception_returns_stable_missing_file_message(self) -> None:
        error = FileNotFoundError(2, "No such file or directory", "/tmp/missing.csv")
        self.assertEqual(format_cli_exception(error), "input file not found: /tmp/missing.csv")

    def test_format_cli_exception_returns_stable_directory_message(self) -> None:
        error = IsADirectoryError(21, "Is a directory", "/tmp/docs-dir")
        self.assertEqual(format_cli_exception(error), "input path is a directory: /tmp/docs-dir")

    def test_format_cli_exception_returns_stable_permission_message(self) -> None:
        error = PermissionError(13, "Permission denied", "/tmp/protected.csv")
        self.assertEqual(format_cli_exception(error), "input file is not readable: /tmp/protected.csv")

    def test_format_cli_exception_returns_stable_generic_oserror_message(self) -> None:
        error = OSError(5, "Input/output error", "/tmp/corrupt.csv")
        self.assertEqual(
            format_cli_exception(error),
            "input I/O error: /tmp/corrupt.csv (Input/output error)",
        )

    def test_format_cli_exception_returns_stable_duplicate_header_message(self) -> None:
        error = DuplicateHeaderError(["RuleId"], path=Path("/tmp/dup.csv"))
        self.assertEqual(format_cli_exception(error), "input csv has duplicate header: RuleId")

    def test_format_cli_exception_returns_generic_duplicate_header_message_without_columns(self) -> None:
        error = DuplicateHeaderError([], path=Path("/tmp/dup.csv"))
        self.assertEqual(format_cli_exception(error), "input csv has duplicate header")

    def test_format_cli_exception_returns_stable_missing_header_name_message(self) -> None:
        error = MissingHeaderNameError([2, 4], path=Path("/tmp/missing.csv"))
        self.assertEqual(
            format_cli_exception(error),
            "input csv header has empty column name at positions: 2,4",
        )

    def test_classify_exception_code_maps_known_failures(self) -> None:
        self.assertEqual(classify_exception_code(EmptyCsvError("empty csv: /tmp/docs.csv")), "empty_csv")
        self.assertEqual(classify_exception_code(IsADirectoryError(21, "Is a directory", "/tmp/docs")), "is_directory")

    def test_dedupe_preserving_order_keeps_first_occurrence_order(self) -> None:
        self.assertEqual(
            dedupe_preserving_order(["validation_error", "validation_error", "file_not_found", "validation_error"]),
            ["validation_error", "file_not_found"],
        )

    def test_print_result_json_output_is_key_sorted_for_stable_diffing(self) -> None:
        stdout = io.StringIO()
        with redirect_stdout(stdout):
            phase9_sync.print_result(
                "NG",
                ["A", "B"],
                ["sample error"],
                "json",
                error_codes=["validation_error"],
            )
        output = stdout.getvalue().strip()
        self.assertTrue(output.startswith('{"errorCodeSummary"'))

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

    def test_normalize_header_cells_trims_bom_and_whitespace(self) -> None:
        header = normalize_header_cells(["\ufeff BenchmarkTable ", " RuleId ", "Owner"])
        self.assertEqual(header, ["BenchmarkTable", "RuleId", "Owner"])

    def test_normalize_header_cells_raises_on_duplicate_columns(self) -> None:
        with self.assertRaises(DuplicateHeaderError):
            normalize_header_cells(["RuleId", " RuleId "], path=Path("dup.csv"))

    def test_normalize_header_cells_raises_on_empty_header_cells(self) -> None:
        with self.assertRaises(MissingHeaderNameError) as ctx:
            normalize_header_cells(["RuleId", "  "], path=Path("missing.csv"))
        self.assertEqual(ctx.exception.positions, (2,))

    def test_normalize_header_cells_reports_multiple_empty_header_positions(self) -> None:
        with self.assertRaises(MissingHeaderNameError) as ctx:
            normalize_header_cells(["RuleId", "  ", ""], path=Path("missing.csv"))
        self.assertEqual(ctx.exception.positions, (2, 3))

    def test_read_rows_with_header_returns_header_and_rows(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "rows.csv"
            path.write_text("A,B\nx,y\n", encoding="utf-8")

            header, rows = read_rows_with_header(path)
            self.assertEqual(header, ["A", "B"])
            self.assertEqual(rows, [{"A": "x", "B": "y"}])

    def test_read_rows_with_header_normalizes_bom_header(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "bom.csv"
            path.write_text("\ufeffA,B\nx,y\n", encoding="utf-8")

            header, rows = read_rows_with_header(path)
            self.assertEqual(header, ["A", "B"])
            self.assertEqual(rows, [{"A": "x", "B": "y"}])

    def test_read_rows_normalizes_bom_header_keys(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "bom.csv"
            path.write_text("\ufeffA,B\nx,y\n", encoding="utf-8")

            rows = read_rows(path)
            self.assertEqual(rows, [{"A": "x", "B": "y"}])

    def test_read_rows_with_header_raises_empty_csv_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "empty.csv"
            path.write_text("", encoding="utf-8")

            with self.assertRaises(EmptyCsvError):
                read_rows_with_header(path)

    def test_validate_quality_rows_reports_missing_required_cells(self) -> None:
        rows = [
            {
                "BenchmarkTable": "RequirementsTraceability",
                "RuleId": "",
                "RuleSet": "ReqTrace",
                "ConditionExpr": "module=AUTH",
                "ActionExpr": "link",
                "EffectiveFrom": "2026-04-03",
                "ExpiresAt": "2026-12-31",
                "RelatedRequirement": "Phase9-Template",
                "RelatedTest": "phase9:test",
            }
        ]
        errors = validate_quality_rows(Path("docs.csv"), rows)
        self.assertTrue(any("missing required column `RuleId`" in error for error in errors))

    def test_validate_sync_returns_empty_errors_for_valid_pair(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            docs = Path(tmp) / "docs.csv"
            fixture = Path(tmp) / "fixture.csv"
            content = f"{BASE_HEADER}\n{BASE_ROW}\n"
            docs.write_text(content, encoding="utf-8")
            fixture.write_text(content, encoding="utf-8")

            errors, docs_header = validate_sync_with_header(docs, fixture)
            self.assertEqual(errors, [])
            self.assertEqual(docs_header, BASE_HEADER.split(","))

    def test_validate_sync_treats_bom_prefixed_header_as_equivalent(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            docs = Path(tmp) / "docs.csv"
            fixture = Path(tmp) / "fixture.csv"
            docs.write_text(f"\ufeff{BASE_HEADER}\n{BASE_ROW}\n", encoding="utf-8")
            fixture.write_text(f"{BASE_HEADER}\n{BASE_ROW}\n", encoding="utf-8")

            errors = validate_sync(docs, fixture)
            self.assertEqual(errors, [])

    def test_validate_sync_with_header_returns_normalized_header_cells(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            docs = Path(tmp) / "docs.csv"
            fixture = Path(tmp) / "fixture.csv"
            docs.write_text(f"\ufeff {BASE_HEADER}\n{BASE_ROW}\n", encoding="utf-8")
            fixture.write_text(f"{BASE_HEADER}\n{BASE_ROW}\n", encoding="utf-8")

            errors, docs_header = validate_sync_with_header(docs, fixture)
            self.assertEqual(errors, [])
            self.assertEqual(docs_header, BASE_HEADER.split(","))

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

            completed = self.run_sync_cli(docs, fixture)
            self.assertEqual(completed.returncode, 0)
            self.assertIn("phase9 template sync: OK", completed.stdout)
            self.assertIn(f"schemaVersion: {JSON_SCHEMA_VERSION}", completed.stdout)
            self.assertIn(f"header: {BASE_HEADER}", completed.stdout)

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

            completed = self.run_sync_cli(docs, fixture)
            self.assertEqual(completed.returncode, 1)
            self.assertIn("phase9 template sync: NG", completed.stdout)
            self.assertIn("errorCodes: validation_error", completed.stdout)
            self.assertIn("[validation_error]", completed.stdout)

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

            completed = self.run_sync_cli(docs, fixture, ignore_row_order=True)
            self.assertEqual(completed.returncode, 0)
            self.assertIn("phase9 template sync: OK", completed.stdout)

    def test_cli_returns_nonzero_when_input_files_are_missing(self) -> None:
        completed = self.run_sync_cli("does-not-exist.csv", "does-not-exist-too.csv")
        self.assertEqual(completed.returncode, 1)
        self.assertIn("phase9 template sync: NG", completed.stdout)
        self.assertIn(f"schemaVersion: {JSON_SCHEMA_VERSION}", completed.stdout)
        self.assertIn("errorCodes: file_not_found", completed.stdout)
        self.assertIn("[file_not_found]", completed.stdout)
        self.assertIn("input file not found:", completed.stdout)

    def test_cli_returns_nonzero_when_input_path_is_directory(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            docs_dir = Path(tmp) / "docs-dir"
            docs_dir.mkdir()
            fixture = Path(tmp) / "fixture.csv"
            fixture.write_text(f"{BASE_HEADER}\n{BASE_ROW}\n", encoding="utf-8")

            completed = self.run_sync_cli(docs_dir, fixture)
            self.assertEqual(completed.returncode, 1)
            self.assertIn("phase9 template sync: NG", completed.stdout)
            self.assertIn("[is_directory]", completed.stdout)
            self.assertIn("input path is a directory:", completed.stdout)

    def test_cli_json_output_for_success(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            docs = Path(tmp) / "docs.csv"
            fixture = Path(tmp) / "fixture.csv"
            content = f"{BASE_HEADER}\n{BASE_ROW}\n"
            docs.write_text(content, encoding="utf-8")
            fixture.write_text(content, encoding="utf-8")

            completed = self.run_sync_cli(docs, fixture, output_format="json")
            payload = self.parse_json_stdout(completed)
            self.assertEqual(completed.returncode, 0)
            self.assert_json_contract_basics(payload, "ok")
            self.assertEqual(payload["errors"], [])
            self.assertEqual(payload["errorCount"], 0)
            self.assertEqual(payload["header"], BASE_HEADER.split(","))

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

            completed = self.run_sync_cli(docs, fixture, output_format="json", ignore_row_order=True)
            payload = self.parse_json_stdout(completed)
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

            completed = self.run_sync_cli(docs, fixture, output_format="json", ignore_row_order=True)
            payload = self.parse_json_stdout(completed)
            self.assertEqual(completed.returncode, 1)
            self.assertEqual(payload["status"], "ng")
            self.assertTrue(any("row mismatch" in error for error in payload["errors"]))

    def test_cli_json_output_for_failure(self) -> None:
        completed = self.run_sync_cli("does-not-exist.csv", "does-not-exist-too.csv", output_format="json")
        payload = self.parse_json_stdout(completed)
        self.assertEqual(completed.returncode, 1)
        self.assert_json_contract_basics(payload, "ng")
        self.assertEqual(payload["errorCount"], 1)
        self.assertEqual(payload["errorCodes"], ["file_not_found"])
        self.assertEqual(payload["errorCodeSummary"], ["file_not_found"])
        self.assertEqual(len(payload["errorCodes"]), len(payload["errors"]))
        self.assertTrue(any(error.startswith("input file not found:") for error in payload["errors"]))

    def test_cli_json_output_for_validation_failure_includes_header(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            docs = Path(tmp) / "docs.csv"
            fixture = Path(tmp) / "fixture.csv"
            docs.write_text(
                f"{BASE_HEADER}\nRequirementsTraceability,REQ_TRACE_AUTH,ReqTrace,module=AUTH,link,90,2026-12-31,2026-04-03,"
                "header=first,Phase9-Template,phase9:test,author,bad range\n",
                encoding="utf-8",
            )
            fixture.write_text(f"{BASE_HEADER}\n{BASE_ROW}\n", encoding="utf-8")

            completed = self.run_sync_cli(docs, fixture, output_format="json")
            payload = self.parse_json_stdout(completed)
            self.assertEqual(completed.returncode, 1)
            self.assert_json_contract_basics(payload, "ng")
            self.assertEqual(payload["header"], BASE_HEADER.split(","))
            self.assertTrue(all(code == "validation_error" for code in payload["errorCodes"]))
            self.assertEqual(payload["errorCodeSummary"], ["validation_error"])
            self.assertEqual(len(payload["errorCodes"]), len(payload["errors"]))
            self.assertTrue(payload["errors"])

    def test_cli_json_output_for_empty_csv_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            docs = Path(tmp) / "docs.csv"
            fixture = Path(tmp) / "fixture.csv"
            docs.write_text("", encoding="utf-8")
            fixture.write_text(f"{BASE_HEADER}\n{BASE_ROW}\n", encoding="utf-8")

            completed = self.run_sync_cli(docs, fixture, output_format="json")
            payload = self.parse_json_stdout(completed)
            self.assertEqual(completed.returncode, 1)
            self.assertEqual(payload["status"], "ng")
            self.assertTrue(any(error.startswith("input csv is empty:") for error in payload["errors"]))

    def test_cli_json_output_for_duplicate_header_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            docs = Path(tmp) / "docs.csv"
            fixture = Path(tmp) / "fixture.csv"
            docs.write_text("RuleId, RuleId\na,b\n", encoding="utf-8")
            fixture.write_text(f"{BASE_HEADER}\n{BASE_ROW}\n", encoding="utf-8")

            completed = self.run_sync_cli(docs, fixture, output_format="json")
            payload = self.parse_json_stdout(completed)
            self.assertEqual(completed.returncode, 1)
            self.assertEqual(payload["status"], "ng")
            self.assertTrue(any(error.startswith("input csv has duplicate header:") for error in payload["errors"]))

    def test_cli_json_output_for_missing_header_name_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            docs = Path(tmp) / "docs.csv"
            fixture = Path(tmp) / "fixture.csv"
            docs.write_text("RuleId, \na,b\n", encoding="utf-8")
            fixture.write_text(f"{BASE_HEADER}\n{BASE_ROW}\n", encoding="utf-8")

            completed = self.run_sync_cli(docs, fixture, output_format="json")
            payload = self.parse_json_stdout(completed)
            self.assertEqual(completed.returncode, 1)
            self.assertEqual(payload["status"], "ng")
            self.assertEqual(payload["errorCodes"], ["missing_header_name"])
            self.assertIn("input csv header has empty column name at positions: 2", payload["errors"])

    def test_cli_text_output_for_missing_header_name_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            docs = Path(tmp) / "docs.csv"
            fixture = Path(tmp) / "fixture.csv"
            docs.write_text("RuleId, \na,b\n", encoding="utf-8")
            fixture.write_text(f"{BASE_HEADER}\n{BASE_ROW}\n", encoding="utf-8")

            completed = self.run_sync_cli(docs, fixture)
            self.assertEqual(completed.returncode, 1)
            self.assertIn("phase9 template sync: NG", completed.stdout)
            self.assertIn("input csv header has empty column name at positions:", completed.stdout)

    def test_cli_text_output_for_duplicate_header_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            docs = Path(tmp) / "docs.csv"
            fixture = Path(tmp) / "fixture.csv"
            docs.write_text("RuleId, RuleId\na,b\n", encoding="utf-8")
            fixture.write_text(f"{BASE_HEADER}\n{BASE_ROW}\n", encoding="utf-8")

            completed = self.run_sync_cli(docs, fixture)
            self.assertEqual(completed.returncode, 1)
            self.assertIn("phase9 template sync: NG", completed.stdout)
            self.assertIn("input csv has duplicate header:", completed.stdout)

    def test_cli_json_output_for_directory_input_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            docs_dir = Path(tmp) / "docs-dir"
            docs_dir.mkdir()
            fixture = Path(tmp) / "fixture.csv"
            fixture.write_text(f"{BASE_HEADER}\n{BASE_ROW}\n", encoding="utf-8")

            completed = self.run_sync_cli(docs_dir, fixture, output_format="json")
            payload = self.parse_json_stdout(completed)
            self.assertEqual(completed.returncode, 1)
            self.assert_json_contract_basics(payload, "ng")
            self.assertEqual(payload["errorCodes"], ["is_directory"])
            self.assertGreaterEqual(len(payload["errors"]), 1)
            self.assertTrue(any(error.startswith("input path is a directory:") for error in payload["errors"]))

    def test_main_returns_ng_for_permission_error_in_text_mode(self) -> None:
        fake_error = PermissionError(13, "Permission denied", "/tmp/protected.csv")
        stdout = io.StringIO()
        with patch.object(
            phase9_sync, "validate_sync_with_header", side_effect=fake_error
        ), patch.object(sys, "argv", ["check_phase9_template_sync.py"]), redirect_stdout(stdout):
            exit_code = phase9_sync.main()

        self.assertEqual(exit_code, 1)
        output = stdout.getvalue()
        self.assertIn("phase9 template sync: NG", output)
        self.assertIn("[permission_denied]", output)
        self.assertIn("input file is not readable: /tmp/protected.csv", output)

    def test_main_returns_ng_for_generic_oserror_in_json_mode(self) -> None:
        fake_error = OSError(5, "Input/output error", "/tmp/corrupt.csv")
        stdout = io.StringIO()
        with patch.object(
            phase9_sync, "validate_sync_with_header", side_effect=fake_error
        ), patch.object(
            sys,
            "argv",
            ["check_phase9_template_sync.py", "--format", "json"],
        ), redirect_stdout(stdout):
            exit_code = phase9_sync.main()

        self.assertEqual(exit_code, 1)
        payload = json.loads(stdout.getvalue())
        self.assert_json_contract_basics(payload, "ng")
        self.assertEqual(payload["errorCodes"], ["io_error"])
        self.assertTrue(any(error.startswith("input I/O error: /tmp/corrupt.csv") for error in payload["errors"]))


if __name__ == "__main__":
    unittest.main()
