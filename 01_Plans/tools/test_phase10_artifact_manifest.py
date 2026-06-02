from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import phase10_artifact_manifest as manifest


class Phase10ArtifactManifestTests(unittest.TestCase):
    @staticmethod
    def run_cli(output_dir: Path, output_path: Path, markdown_path: Path | None = None) -> subprocess.CompletedProcess[str]:
        command = [
            sys.executable,
            str(Path(__file__).with_name("phase10_artifact_manifest.py")),
            "--output-dir",
            str(output_dir),
            "--output",
            str(output_path),
        ]
        if markdown_path is not None:
            command.extend(["--markdown-output", str(markdown_path)])
        return subprocess.run(command, check=False, capture_output=True, text=True)

    def test_build_manifest_collects_checksums(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "a.json").write_text('{"ok":true}\n', encoding="utf-8")
            (root / "b.md").write_text("# hello\n", encoding="utf-8")
            payload = manifest.build_manifest(root)
            self.assertEqual(payload["fileCount"], 2)
            self.assertEqual(len(payload["files"][0]["sha256"]), 64)

    def test_cli_writes_json_and_markdown(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "x.txt").write_text("abc", encoding="utf-8")
            output = root / "manifest.json"
            markdown = root / "manifest.md"
            completed = self.run_cli(root, output, markdown)
            self.assertEqual(completed.returncode, 0, msg=completed.stderr)
            self.assertTrue(output.exists())
            self.assertTrue(markdown.exists())
            parsed = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(parsed["fileCount"], 1)


if __name__ == "__main__":
    unittest.main()
