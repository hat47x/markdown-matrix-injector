#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path


DEFAULT_FILES = [
    "artifacts/release-gate.json",
    "artifacts/release-gate.md",
    "artifacts/release-gate-metrics.csv",
]


def remove_artifacts(repo_root: Path, targets: list[str]) -> list[str]:
    removed: list[str] = []
    for target in targets:
        path = repo_root / target
        if path.exists() and path.is_file():
            path.unlink()
            removed.append(str(path))
    artifacts_dir = repo_root / "artifacts"
    if artifacts_dir.exists() and not any(artifacts_dir.iterdir()):
        artifacts_dir.rmdir()
    return removed


def main() -> int:
    parser = argparse.ArgumentParser(description="Clean generated release gate artifacts")
    parser.add_argument("--repo-root", default=".", help="Repository root")
    parser.add_argument("--target", action="append", default=[], help="Additional artifact path to remove")
    args = parser.parse_args()

    targets = DEFAULT_FILES + list(args.target)
    removed = remove_artifacts(Path(args.repo_root).resolve(), targets)
    print(f"removed {len(removed)} artifact(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
