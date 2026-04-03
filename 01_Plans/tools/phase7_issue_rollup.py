#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from pathlib import Path

STATUS_RE = re.compile(r"^- Status:\s*(.+?)\s*$")
TITLE_RE = re.compile(r"^#\s+Issue:\s*(.+?)\s*$")


def extract_issue_meta(path: Path) -> tuple[str, str]:
    title = path.stem
    status = "Unknown"
    for line in path.read_text(encoding="utf-8").splitlines():
        if m := TITLE_RE.match(line.strip()):
            title = m.group(1)
        if m := STATUS_RE.match(line.strip()):
            status = m.group(1)
            break
    return title, status


def collect_phase7_issues(repo_root: Path) -> list[tuple[str, str, str]]:
    issue_dir = repo_root / "01_Plans" / "issues"
    rows: list[tuple[str, str, str]] = []
    for path in sorted(issue_dir.glob("issue-00*.md")):
        match = re.match(r"issue-(\d+)-", path.name)
        if not match:
            continue
        issue_no = int(match.group(1))
        if issue_no < 43:
            continue
        title, status = extract_issue_meta(path)
        rows.append((path.name, status, title))
    return rows


def build_markdown(rows: list[tuple[str, str, str]]) -> str:
    lines = ["# Phase 7 Issue Rollup", "", "| Issue | Status | Title |", "|---|---|---|"]
    for name, status, title in rows:
        lines.append(f"| `{name}` | {status} | {title} |")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate a markdown rollup of Phase 7 issues")
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--output-file", default="artifacts/phase7-issue-rollup.md")
    args = parser.parse_args()

    root = Path(args.repo_root).resolve()
    rows = collect_phase7_issues(root)
    output_path = root / args.output_file
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(build_markdown(rows), encoding="utf-8")
    print(f"wrote rollup: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
