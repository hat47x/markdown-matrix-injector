#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

ADR_STATUS_RE = re.compile(r"^- Status:\s*(.+?)\s*$")
ISSUE_STATUS_RE = re.compile(r"^- Status:\s*(.+?)\s*$")
ISSUE_PRIORITY_RE = re.compile(r"^- Priority:\s*(.+?)\s*$")
ISSUE_SCOPE_RE = re.compile(r"^- Scope:\s*(.+?)\s*$")
ISSUE_RELATED_RE = re.compile(r"^- Related ADR/Spec:\s*(.+?)\s*$")
TITLE_RE = re.compile(r"^#\s+(.+?)\s*$")
ADR_REF_RE = re.compile(r"ADR-\d{4}")

DEFAULT_SCAN_LINES = 80
ADR_PENDING_STATUSES = {"draft", "proposed"}
ISSUE_PENDING_STATUSES = {"draft", "open", "in progress"}
GITHUB_ISSUE_TIMEOUT_SEC = 20


@dataclass
class AdrItem:
    path: str
    title: str
    status: str
    pending: bool


@dataclass
class IssueItem:
    path: str
    title: str
    status: str
    priority: str
    scope: str
    related_adrs: list[str]
    pending: bool


@dataclass
class GitHubIssue:
    number: int
    title: str
    labels: list[str]
    url: str


@dataclass
class QueueReport:
    pending_adrs: list[AdrItem]
    pending_issues: list[IssueItem]
    orphan_issues: list[IssueItem]
    github_issues: list[GitHubIssue]
    github_available: bool
    summary: dict[str, int]


def read_head_lines(path: Path, max_lines: int = DEFAULT_SCAN_LINES) -> list[str]:
    lines: list[str] = []
    with path.open("r", encoding="utf-8") as handle:
        for _, line in zip(range(max_lines), handle):
            lines.append(line.rstrip("\n"))
    return lines


def first_match(lines: Iterable[str], pattern: re.Pattern[str], default: str = "") -> str:
    for line in lines:
        match = pattern.match(line.strip())
        if match:
            return match.group(1).strip()
    return default


def status_key(status: str) -> str:
    """Leading status word(s): `In Progress（2026-09-24 実装…）` -> `in progress`."""
    return re.split(r"[（(:;、,]", status, maxsplit=1)[0].strip().lower()


def parse_adr(path: Path, repo_root: Path) -> AdrItem:
    lines = read_head_lines(path)
    title = first_match(lines, TITLE_RE, path.stem)
    status = first_match(lines, ADR_STATUS_RE, "Unknown")
    return AdrItem(
        path=str(path.relative_to(repo_root)),
        title=title,
        status=status,
        pending=status_key(status) in ADR_PENDING_STATUSES,
    )


def parse_issue(path: Path, repo_root: Path) -> IssueItem:
    lines = read_head_lines(path)
    title = first_match(lines, TITLE_RE, path.stem)
    status = first_match(lines, ISSUE_STATUS_RE, "Unknown")
    priority = first_match(lines, ISSUE_PRIORITY_RE, "Unknown")
    scope = first_match(lines, ISSUE_SCOPE_RE, "")
    related_raw = first_match(lines, ISSUE_RELATED_RE, "")
    related_adrs = sorted(set(ADR_REF_RE.findall(related_raw)))
    return IssueItem(
        path=str(path.relative_to(repo_root)),
        title=title,
        status=status,
        priority=priority,
        scope=scope,
        related_adrs=related_adrs,
        pending=status_key(status) in ISSUE_PENDING_STATUSES,
    )


def fetch_github_issues(timeout_sec: int = GITHUB_ISSUE_TIMEOUT_SEC) -> list[GitHubIssue] | None:
    """List open GitHub issues. Returns None when `gh` is unavailable or fails."""
    cmd = [
        "gh",
        "issue",
        "list",
        "--state",
        "open",
        "--limit",
        "500",
        "--json",
        "number,title,labels,url",
    ]
    try:
        proc = subprocess.run(
            cmd,
            text=True,
            capture_output=True,
            check=False,
            timeout=timeout_sec,
            encoding="utf-8",
        )
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return None
    if proc.returncode != 0:
        return None
    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return None

    issues: list[GitHubIssue] = []
    for item in payload:
        try:
            number = int(item["number"])
        except (KeyError, TypeError, ValueError):
            continue
        labels = [label.get("name", "") for label in item.get("labels", []) if isinstance(label, dict)]
        issues.append(
            GitHubIssue(
                number=number,
                title=str(item.get("title", "")),
                labels=labels,
                url=str(item.get("url", "")),
            )
        )
    issues.sort(key=lambda issue: issue.number)
    return issues


def build_report(repo_root: Path, include_github: bool = False) -> QueueReport:
    adr_dir = repo_root / "01_Plans" / "adr"
    issue_dir = repo_root / "04_Documentation" / "history" / "issues"

    adrs = [parse_adr(path, repo_root) for path in sorted(adr_dir.glob("ADR-*.md")) if path.name != "TEMPLATE.md"]
    issues = [parse_issue(path, repo_root) for path in sorted(issue_dir.glob("issue-*.md"))]

    pending_adrs = [adr for adr in adrs if adr.pending]
    pending_issues = [issue for issue in issues if issue.pending]

    known_adr_ids = {Path(adr.path).stem.split("-", 2)[0] + "-" + Path(adr.path).stem.split("-", 2)[1] for adr in adrs}
    orphan_issues = [
        issue
        for issue in pending_issues
        if issue.related_adrs and any(adr_id not in known_adr_ids for adr_id in issue.related_adrs)
    ]

    github_issues: list[GitHubIssue] = []
    github_available = False
    if include_github:
        fetched = fetch_github_issues()
        if fetched is not None:
            github_issues = fetched
            github_available = True

    return QueueReport(
        pending_adrs=pending_adrs,
        pending_issues=pending_issues,
        orphan_issues=orphan_issues,
        github_issues=github_issues,
        github_available=github_available,
        summary={
            "adr_total": len(adrs),
            "adr_pending": len(pending_adrs),
            "issue_total": len(issues),
            "issue_pending": len(pending_issues),
            "issue_orphan": len(orphan_issues),
            "github_open": len(github_issues),
            "github_available": 1 if github_available else 0,
        },
    )


def print_text(report: QueueReport, include_github: bool) -> None:
    print("# Planning Queue Summary")
    for key, value in report.summary.items():
        print(f"- {key}: {value}")

    print("\n## Pending ADRs")
    if report.pending_adrs:
        for item in report.pending_adrs:
            print(f"- [{item.status}] {item.path} :: {item.title}")
    else:
        print("- none")

    print("\n## Pending Local Issues")
    if report.pending_issues:
        for item in report.pending_issues:
            related = ", ".join(item.related_adrs) if item.related_adrs else "(no ADR reference)"
            print(
                f"- [{item.status} | {item.priority}] {item.path} :: {item.title} | related={related} | scope={item.scope}"
            )
    else:
        print("- none")

    print("\n## Pending Local Issues With Missing ADR Reference")
    if report.orphan_issues:
        for item in report.orphan_issues:
            print(f"- {item.path} :: missing {', '.join(item.related_adrs)}")
    else:
        print("- none")

    if include_github:
        print("\n## Open GitHub Issues")
        if not report.github_available:
            print("- unavailable (gh not found, not authenticated, or offline)")
        elif report.github_issues:
            for issue in report.github_issues:
                labels = ", ".join(issue.labels) if issue.labels else "(no label)"
                print(f"- #{issue.number} [{labels}] {issue.title} :: {issue.url}")
        else:
            print("- none")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Scan ADR / Issue meta sections to find pending planning items without loading full documents."
    )
    parser.add_argument("--repo-root", default=".", help="Repository root path. Default: current directory")
    parser.add_argument("--format", choices=("text", "json"), default="text", help="Output format")
    parser.add_argument(
        "--github",
        action="store_true",
        help="Also list open GitHub issues via the gh CLI (unavailable environments are reported, not failed)",
    )
    args = parser.parse_args()

    try:
        sys.stdout.reconfigure(errors="replace")
    except (AttributeError, ValueError, OSError):
        pass

    report = build_report(Path(args.repo_root).resolve(), include_github=args.github)
    if args.format == "json":
        print(json.dumps(asdict(report), ensure_ascii=False, indent=2))
    else:
        print_text(report, include_github=args.github)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
