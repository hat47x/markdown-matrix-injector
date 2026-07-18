from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from release_gate_clean import remove_artifacts


class ReleaseGateCleanTests(unittest.TestCase):
    def test_remove_artifacts_deletes_known_files_and_empty_dir(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            artifacts = repo / "artifacts"
            artifacts.mkdir()
            (artifacts / "release-gate.json").write_text("{}", encoding="utf-8")
            (artifacts / "release-gate.md").write_text("#", encoding="utf-8")
            removed = remove_artifacts(repo, ["artifacts/release-gate.json", "artifacts/release-gate.md"])
            self.assertEqual(len(removed), 2)
            self.assertFalse(artifacts.exists())

    def test_remove_artifacts_keeps_dir_when_untracked_file_exists(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            artifacts = repo / "artifacts"
            artifacts.mkdir()
            (artifacts / "keep.txt").write_text("keep", encoding="utf-8")
            removed = remove_artifacts(repo, ["artifacts/release-gate.json"])
            self.assertEqual(removed, [])
            self.assertTrue(artifacts.exists())


if __name__ == "__main__":
    unittest.main()
