from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from release_gate_assert_artifacts import find_missing


class ReleaseGateAssertArtifactsTests(unittest.TestCase):
    def test_find_missing_reports_unavailable_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            missing = find_missing(root, ["artifacts/a.json", "artifacts/b.md"])
            self.assertEqual(missing, ["artifacts/a.json", "artifacts/b.md"])

    def test_find_missing_skips_present_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            artifacts = root / "artifacts"
            artifacts.mkdir()
            (artifacts / "a.json").write_text("{}", encoding="utf-8")
            missing = find_missing(root, ["artifacts/a.json"])
            self.assertEqual(missing, [])


if __name__ == "__main__":
    unittest.main()
