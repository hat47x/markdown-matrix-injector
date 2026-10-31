#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


@dataclass
class GateResult:
    gate: str
    passed: bool
    detail: str


def run_command(cmd: list[str], cwd: Path, timeout_sec: int) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            cmd,
            cwd=cwd,
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
            check=False,
            timeout=timeout_sec,
        )
    except FileNotFoundError as exc:
        return subprocess.CompletedProcess(cmd, 127, "", f"command not found: {exc.filename}")
    except subprocess.TimeoutExpired:
        return subprocess.CompletedProcess(cmd, 124, "", f"timeout after {timeout_sec}s")


def evaluate_planning_summary(summary: dict[str, Any], allow_pending_issues: bool) -> GateResult:
    issue_orphan = int(summary.get("issue_orphan", 0))
    issue_pending = int(summary.get("issue_pending", 0))

    if issue_orphan != 0:
        return GateResult("G1:Planning", False, f"orphan issues detected: {issue_orphan}")
    if not allow_pending_issues and issue_pending != 0:
        return GateResult("G1:Planning", False, f"pending issues detected: {issue_pending}")

    detail = f"orphan={issue_orphan}, pending={issue_pending}"
    if allow_pending_issues:
        detail += " (pending allowed)"
    return GateResult("G1:Planning", True, detail)


def evaluate_planning_gate(repo_root: Path, allow_pending_issues: bool, timeout_sec: int) -> GateResult:
    proc = run_command(
        [sys.executable, "03_Implement/tools/planning_queue.py", "--format", "json"],
        cwd=repo_root,
        timeout_sec=timeout_sec,
    )
    if proc.returncode != 0:
        stderr = proc.stderr.strip() or "unknown error"
        return GateResult("G1:Planning", False, f"planning_queue failed: {stderr}")

    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        return GateResult("G1:Planning", False, f"planning_queue json parse failed: {exc.msg}")

    summary = payload.get("summary")
    if not isinstance(summary, dict):
        return GateResult("G1:Planning", False, "planning_queue output missing summary object")

    return evaluate_planning_summary(summary, allow_pending_issues)


def evaluate_test_gate(repo_root: Path, timeout_sec: int, skip_tests: bool) -> GateResult:
    if skip_tests:
        return GateResult("G2:Tests", True, "skipped by --skip-tests")

    proc = run_command(["npm", "run", "test:unit"], cwd=repo_root / "03_Implement", timeout_sec=timeout_sec)
    if proc.returncode != 0:
        tail = (proc.stdout + "\n" + proc.stderr).strip().splitlines()[-10:]
        return GateResult("G2:Tests", False, " | ".join(tail))
    return GateResult("G2:Tests", True, "npm run test:unit passed")


def evaluate_phase9_sync_gate(
    repo_root: Path,
    timeout_sec: int,
    skip_tests: bool,
    ignore_row_order: bool,
) -> GateResult:
    if skip_tests:
        detail = "skipped by --skip-tests"
        if ignore_row_order:
            detail += " (ignore-row-order not evaluated)"
        return GateResult("G3:Phase9Sync", True, detail)

    command = [sys.executable, "03_Implement/tools/check_phase9_template_sync.py", "--format", "json"]
    if ignore_row_order:
        command.append("--ignore-row-order")

    proc = run_command(
        command,
        cwd=repo_root,
        timeout_sec=timeout_sec,
    )
    if proc.returncode != 0:
        detail = (proc.stdout + "\n" + proc.stderr).strip().replace("\n", " | ")
        return GateResult("G3:Phase9Sync", False, detail or "phase9 sync checker failed")

    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        return GateResult("G3:Phase9Sync", False, f"phase9 sync json parse failed: {exc.msg}")

    status = str(payload.get("status", "")).lower()
    if status != "ok":
        return GateResult("G3:Phase9Sync", False, f"phase9 sync status is `{status or 'unknown'}`")
    detail = "phase9 sync checker passed"
    if ignore_row_order:
        detail += " (ignore-row-order)"
    return GateResult("G3:Phase9Sync", True, detail)


def evaluate_phase9_guide_sync_gate(
    repo_root: Path,
    timeout_sec: int,
    skip_tests: bool,
) -> GateResult:
    """Verify the standalone pattern guide has not drifted from the docs CSV (ADR-0013)."""
    if skip_tests:
        return GateResult("G4:Phase9GuideSync", True, "skipped by --skip-tests")

    command = [sys.executable, "03_Implement/tools/generate_phase9_pattern_guide.py", "--check"]
    proc = run_command(command, cwd=repo_root, timeout_sec=timeout_sec)
    if proc.returncode != 0:
        detail = (proc.stdout + "\n" + proc.stderr).strip().replace("\n", " | ")
        return GateResult("G4:Phase9GuideSync", False, detail or "phase9 guide sync check failed")

    # Success output: "OK: <path> is in sync with <csv>"
    detail = proc.stdout.strip() or "phase9 guide sync check passed"
    return GateResult("G4:Phase9GuideSync", True, detail)


def run_release_gates(
    repo_root: Path,
    allow_pending_issues: bool,
    planning_timeout_sec: int,
    npm_test_timeout_sec: int,
    skip_tests: bool,
    phase9_ignore_row_order: bool,
) -> list[GateResult]:
    return [
        evaluate_planning_gate(repo_root, allow_pending_issues, planning_timeout_sec),
        evaluate_test_gate(repo_root, npm_test_timeout_sec, skip_tests),
        evaluate_phase9_sync_gate(repo_root, npm_test_timeout_sec, skip_tests, phase9_ignore_row_order),
        evaluate_phase9_guide_sync_gate(repo_root, npm_test_timeout_sec, skip_tests),
    ]


def serialize_results(results: list[GateResult]) -> str:
    return json.dumps([asdict(result) for result in results], ensure_ascii=False, indent=2)


def build_markdown_report(results: list[GateResult]) -> str:
    lines = ["# Release Gate Report", ""]
    for result in results:
        status = "PASS" if result.passed else "FAIL"
        lines.append(f"- **{result.gate}**: {status}\n  - Detail: {result.detail}")
    return "\n".join(lines) + "\n"


def ensure_trailing_newline(payload: str) -> str:
    return payload if payload.endswith("\n") else payload + "\n"


def write_output_file(path_value: str, payload: str, repo_root: Path) -> None:
    output_path = Path(path_value)
    if not output_path.is_absolute():
        output_path = repo_root / output_path
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(ensure_trailing_newline(payload), encoding="utf-8")


def main() -> int:
    default_repo_root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description="Run the Phase 7 minimum release gate checks.")
    parser.add_argument(
        "--repo-root",
        default=str(default_repo_root),
        help="Repository root path (defaults to repository root derived from this script location)",
    )
    parser.add_argument(
        "--allow-pending-issues",
        action="store_true",
        help="Allow pending issues when running G1 planning gate (useful during active execution)",
    )
    parser.add_argument("--planning-timeout-sec", type=int, default=60, help="Timeout for planning gate command")
    parser.add_argument("--npm-test-timeout-sec", type=int, default=900, help="Timeout for npm test command")
    parser.add_argument("--skip-tests", action="store_true", help="Skip running npm test (docs-only checks)")
    parser.add_argument(
        "--phase9-ignore-row-order",
        action="store_true",
        help="Pass --ignore-row-order to the Phase9 sync checker gate",
    )
    parser.add_argument(
        "--format",
        choices=("text", "json"),
        default="text",
        help="Output format",
    )
    parser.add_argument(
        "--output-file",
        default="",
        help="Optional file path to persist JSON results (relative paths are resolved from repo root)",
    )
    parser.add_argument(
        "--output-markdown-file",
        default="",
        help="Optional file path to persist Markdown report results",
    )
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    results = run_release_gates(
        repo_root=repo_root,
        allow_pending_issues=args.allow_pending_issues,
        planning_timeout_sec=args.planning_timeout_sec,
        npm_test_timeout_sec=args.npm_test_timeout_sec,
        skip_tests=args.skip_tests,
        phase9_ignore_row_order=args.phase9_ignore_row_order,
    )

    has_failure = any(not result.passed for result in results)
    json_payload = serialize_results(results)

    if args.format == "json":
        print(json_payload)
    else:
        print("# Release Gate Check")
        for result in results:
            status = "PASS" if result.passed else "FAIL"
            print(f"- {result.gate}: {status} :: {result.detail}")

    if args.output_file:
        write_output_file(args.output_file, json_payload, repo_root)

    if args.output_markdown_file:
        write_output_file(args.output_markdown_file, build_markdown_report(results), repo_root)

    return 1 if has_failure else 0


if __name__ == "__main__":
    raise SystemExit(main())
