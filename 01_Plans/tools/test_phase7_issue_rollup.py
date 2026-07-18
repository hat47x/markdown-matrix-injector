from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from phase7_issue_rollup import build_markdown, collect_phase7_issues


class Phase7IssueRollupTests(unittest.TestCase):
    def test_collect_phase7_issues_filters_before_0043(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            issue_dir = root / "01_Plans" / "issues"
            issue_dir.mkdir(parents=True)
            (issue_dir / "issue-0042-old.md").write_text("# Issue: old\n- Status: Done\n", encoding="utf-8")
            (issue_dir / "issue-0043-new.md").write_text("# Issue: new\n- Status: Open\n", encoding="utf-8")

            rows = collect_phase7_issues(root)
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0][0], "issue-0043-new.md")

    def test_build_markdown_contains_table(self) -> None:
        text = build_markdown([("issue-0043-a.md", "Done", "sample")])
        self.assertIn("| Issue | Status | Title |", text)
        self.assertIn("issue-0043-a.md", text)


if __name__ == "__main__":
    unittest.main()
