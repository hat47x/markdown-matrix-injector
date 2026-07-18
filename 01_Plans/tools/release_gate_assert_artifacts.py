#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

REQUIRED = [
    "artifacts/release-gate.json",
    "artifacts/release-gate.md",
    "artifacts/release-gate-metrics.csv",
    "artifacts/phase7-issue-rollup.md",
]


def find_missing(repo_root: Path, required: list[str]) -> list[str]:
    missing: list[str] = []
    for rel in required:
        path = repo_root / rel
        if not path.exists() or not path.is_file():
            missing.append(rel)
    return missing


def main() -> int:
    parser = argparse.ArgumentParser(description="Assert release-gate artifact files exist")
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--require", action="append", default=[])
    args = parser.parse_args()

    required = REQUIRED + list(args.require)
    root = Path(args.repo_root).resolve()
    missing = find_missing(root, required)
    if missing:
        print("missing artifacts:")
        for item in missing:
            print(f"- {item}")
        return 1

    print("all required artifacts present")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
