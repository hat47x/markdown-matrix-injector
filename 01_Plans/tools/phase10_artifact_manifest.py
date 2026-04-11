#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


class ValidationError(ValueError):
    """Raised when manifest input is invalid."""


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8192), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_manifest(output_dir: Path) -> dict[str, object]:
    if not output_dir.exists() or not output_dir.is_dir():
        raise ValidationError("output_dir must be an existing directory")

    files = sorted(path for path in output_dir.iterdir() if path.is_file())
    entries: list[dict[str, object]] = []
    for path in files:
        entries.append(
            {
                "path": path.name,
                "size_bytes": path.stat().st_size,
                "sha256": _sha256(path),
            }
        )
    return {
        "schemaVersion": "phase10-artifact-manifest/v1",
        "directory": str(output_dir),
        "fileCount": len(entries),
        "files": entries,
    }


def render_markdown(manifest: dict[str, object]) -> str:
    lines = [
        "# Phase 10 Artifact Manifest",
        "",
        f"- Directory: {manifest['directory']}",
        f"- File count: {manifest['fileCount']}",
        "",
        "| path | size_bytes | sha256 |",
        "|---|---:|---|",
    ]
    for row in manifest["files"]:
        lines.append(f"| {row['path']} | {row['size_bytes']} | `{row['sha256']}` |")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate Phase 10 artifact manifest with checksums")
    parser.add_argument("--output-dir", required=True, help="Directory containing phase10 output artifacts")
    parser.add_argument("--output", required=True, help="Path to manifest JSON")
    parser.add_argument("--markdown-output", help="Path to manifest markdown")
    args = parser.parse_args()

    try:
        manifest = build_manifest(Path(args.output_dir))
    except (OSError, ValidationError) as exc:
        print(f"NG: {exc}")
        return 1

    output_path = Path(args.output)
    markdown_path = Path(args.markdown_output) if args.markdown_output else output_path.with_suffix(".md")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    markdown_path.parent.mkdir(parents=True, exist_ok=True)
    markdown_path.write_text(render_markdown(manifest), encoding="utf-8")
    print(f"OK: wrote artifact manifest -> {output_path}")
    print(f"OK: wrote artifact manifest markdown -> {markdown_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
