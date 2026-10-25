from __future__ import annotations

import csv
import io
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import generate_phase9_pattern_guide as guide


CSV_HEADER = (
    "BenchmarkTable,RuleId,RuleSet,ConditionExpr,ActionExpr,Priority,"
    "EffectiveFrom,ExpiresAt,QueryExample,RelatedRequirement,RelatedTest,Owner,Notes"
)


def _row(
    table: str = "RequirementsTraceability",
    rule_id: str = "REQ_TRACE_AUTH",
    query_example: str = "header=first&columns=A,B,C",
    related_test: str = "markdownMatrixPlugin:some-test",
) -> str:
    # Written with the csv module, like the canonical CSV: QueryExample legitimately
    # contains commas (e.g. "columns=A,B,C") and is RFC4180-quoted there, which is what
    # generate_phase9_pattern_guide.read_rows() (csv.DictReader) expects. An unquoted
    # raw comma would shift every later column (RelatedTest would land in Notes).
    buffer = io.StringIO()
    csv.writer(buffer, lineterminator="").writerow(
        [
            table,
            rule_id,
            "ReqTrace",
            "module=AUTH",
            "link req",
            "90",
            "2026-04-03",
            "2026-12-31",
            query_example,
            "Phase9-Template",
            related_test,
            "author",
            "note text",
        ]
    )
    return buffer.getvalue()


def _write_csv(path: Path, rows: list[str]) -> None:
    path.write_text("\n".join([CSV_HEADER, *rows]) + "\n", encoding="utf-8")


class GeneratePhase9PatternGuideTests(unittest.TestCase):
    def test_groups_rows_by_benchmark_table_in_first_seen_order(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            csv_path = Path(tmp) / "input.csv"
            _write_csv(
                csv_path,
                [
                    _row(table="StateTransition", rule_id="STATE_A"),
                    _row(table="RequirementsTraceability", rule_id="REQ_A"),
                    _row(table="StateTransition", rule_id="STATE_B"),
                ],
            )
            rows = guide.read_rows(csv_path)
            grouped = guide.group_by_benchmark_table(rows)

            self.assertEqual(list(grouped.keys()), ["StateTransition", "RequirementsTraceability"])
            self.assertEqual([r["RuleId"] for r in grouped["StateTransition"]], ["STATE_A", "STATE_B"])

    def test_render_guide_includes_query_example_only_in_optional_callout(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            csv_path = Path(tmp) / "input.csv"
            _write_csv(csv_path, [_row(query_example="header=first&grep=AUTH")])
            rendered = guide.render_guide(guide.read_rows(csv_path))

            self.assertIn("Optional: query this table with Markdown Matrix Injector", rendered)
            self.assertIn("header=first&grep=AUTH", rendered)
            # The main table (before the callout) must not itself contain the query string.
            callout_index = rendered.index("Optional: query this table")
            main_table_section = rendered[:callout_index]
            self.assertNotIn("header=first&grep=AUTH", main_table_section)

    def test_render_guide_never_emits_related_test(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            csv_path = Path(tmp) / "input.csv"
            _write_csv(csv_path, [_row(related_test="markdownMatrixPlugin:super-secret-internal-test-name")])
            rendered = guide.render_guide(guide.read_rows(csv_path))

            self.assertNotIn("markdownMatrixPlugin:super-secret-internal-test-name", rendered)
            self.assertNotIn("RelatedTest", rendered)

    def test_render_guide_includes_main_table_columns_and_values(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            csv_path = Path(tmp) / "input.csv"
            _write_csv(csv_path, [_row(rule_id="REQ_TRACE_AUTH")])
            rendered = guide.render_guide(guide.read_rows(csv_path))

            self.assertIn("| RuleId | RuleSet | ConditionExpr | ActionExpr |", rendered)
            self.assertIn("REQ_TRACE_AUTH", rendered)
            self.assertIn(guide.BENCHMARK_TABLE_DESCRIPTIONS["RequirementsTraceability"], rendered)

    def test_group_by_benchmark_table_fails_on_unknown_table(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            csv_path = Path(tmp) / "input.csv"
            _write_csv(csv_path, [_row(table="SomeBrandNewTableNoOneDescribedYet")])
            rows = guide.read_rows(csv_path)

            with self.assertRaises(guide.UnknownBenchmarkTableError):
                guide.group_by_benchmark_table(rows)

    def test_cli_check_passes_when_output_matches(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            csv_path = Path(tmp) / "input.csv"
            out_path = Path(tmp) / "guide.md"
            _write_csv(csv_path, [_row()])

            first = self._run_cli(["--csv", str(csv_path), "--out", str(out_path)])
            self.assertEqual(first.returncode, 0, msg=first.stderr)
            self.assertTrue(out_path.exists())

            second = self._run_cli(["--csv", str(csv_path), "--out", str(out_path), "--check"])
            self.assertEqual(second.returncode, 0, msg=second.stdout + second.stderr)
            self.assertIn("OK", second.stdout)

    def test_cli_check_fails_and_does_not_write_when_stale(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            csv_path = Path(tmp) / "input.csv"
            out_path = Path(tmp) / "guide.md"
            _write_csv(csv_path, [_row(rule_id="REQ_ORIGINAL")])
            self._run_cli(["--csv", str(csv_path), "--out", str(out_path)])
            before_mtime = out_path.stat().st_mtime_ns
            before_content = out_path.read_text(encoding="utf-8")

            # Change the CSV without regenerating the guide.
            _write_csv(csv_path, [_row(rule_id="REQ_CHANGED")])

            completed = self._run_cli(["--csv", str(csv_path), "--out", str(out_path), "--check"])
            self.assertEqual(completed.returncode, 1)
            self.assertIn("NG", completed.stdout)
            self.assertEqual(out_path.stat().st_mtime_ns, before_mtime, msg="--check must not write the file")
            self.assertEqual(out_path.read_text(encoding="utf-8"), before_content)

    def test_default_mode_is_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            csv_path = Path(tmp) / "input.csv"
            out_path = Path(tmp) / "guide.md"
            _write_csv(csv_path, [_row(), _row(table="StateTransition", rule_id="STATE_X")])

            self._run_cli(["--csv", str(csv_path), "--out", str(out_path)])
            first_content = out_path.read_text(encoding="utf-8")
            self._run_cli(["--csv", str(csv_path), "--out", str(out_path)])
            second_content = out_path.read_text(encoding="utf-8")

            self.assertEqual(first_content, second_content)

    def test_output_has_no_embedded_timestamps(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            csv_path = Path(tmp) / "input.csv"
            out_path = Path(tmp) / "guide.md"
            _write_csv(csv_path, [_row()])
            self._run_cli(["--csv", str(csv_path), "--out", str(out_path)])
            content = out_path.read_text(encoding="utf-8")

            self.assertNotRegex(content, r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}")

    @staticmethod
    def _run_cli(extra_args: list[str]) -> subprocess.CompletedProcess[str]:
        command = [
            sys.executable,
            str(Path(__file__).with_name("generate_phase9_pattern_guide.py")),
            *extra_args,
        ]
        return subprocess.run(command, check=False, capture_output=True, text=True)


if __name__ == "__main__":
    unittest.main()
