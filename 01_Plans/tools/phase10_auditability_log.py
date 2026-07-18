#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


class ValidationError(ValueError):
    """Raised when auditability input is invalid."""


ALLOWED_DECISIONS = {"escalate", "defer", "dismiss"}
ALLOWED_PRIORITIES = {"high", "medium", "low"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_candidates(path: Path) -> dict[str, dict[str, object]]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValidationError(f"{path}: failed to read JSON ({exc})") from exc

    if not isinstance(payload, dict):
        raise ValidationError("candidate input must be an object")
    candidates = payload.get("candidates")
    if not isinstance(candidates, list):
        raise ValidationError("candidate input must include candidates[]")

    by_id: dict[str, dict[str, object]] = {}
    for index, row in enumerate(candidates, start=1):
        if not isinstance(row, dict):
            raise ValidationError(f"candidates[{index}] must be an object")
        candidate_id = row.get("candidate_id")
        if not isinstance(candidate_id, str) or not candidate_id.strip():
            raise ValidationError(f"candidates[{index}].candidate_id must be a non-empty string")
        by_id[candidate_id] = row
    return by_id


def parse_decisions(path: Path) -> list[dict[str, str]]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValidationError(f"{path}: failed to read JSON ({exc})") from exc

    if not isinstance(payload, list):
        raise ValidationError("decision input must be an array")

    decisions: list[dict[str, str]] = []
    for index, row in enumerate(payload, start=1):
        if not isinstance(row, dict):
            raise ValidationError(f"decisions[{index}] must be an object")
        decision = str(row.get("decision", "")).strip().lower()
        priority = str(row.get("priority", "")).strip().lower()
        owner = str(row.get("owner", "")).strip()
        candidate_id = str(row.get("candidate_id", "")).strip()
        note = str(row.get("note", "")).strip()
        if decision not in ALLOWED_DECISIONS:
            raise ValidationError(f"decisions[{index}].decision must be one of {sorted(ALLOWED_DECISIONS)}")
        if priority not in ALLOWED_PRIORITIES:
            raise ValidationError(f"decisions[{index}].priority must be one of {sorted(ALLOWED_PRIORITIES)}")
        if not owner:
            raise ValidationError(f"decisions[{index}].owner must be a non-empty string")
        if not candidate_id:
            raise ValidationError(f"decisions[{index}].candidate_id must be a non-empty string")
        if decision == "defer" and not note:
            raise ValidationError(f"decisions[{index}].note is required when decision=defer")
        decisions.append(
            {
                "candidate_id": candidate_id,
                "decision": decision,
                "priority": priority,
                "owner": owner,
                "note": note,
            }
        )
    return decisions


def build_audit_log(
    *,
    candidates_by_id: dict[str, dict[str, object]],
    decisions: list[dict[str, str]],
    decided_at: str,
) -> dict[str, object]:
    entries: list[dict[str, object]] = []
    for row in decisions:
        candidate_id = row["candidate_id"]
        if candidate_id not in candidates_by_id:
            raise ValidationError(f"decision references unknown candidate_id: {candidate_id}")
        candidate = candidates_by_id[candidate_id]
        entries.append(
            {
                "candidate_id": candidate_id,
                "signal": candidate.get("signal", "unknown"),
                "summary": candidate.get("summary", ""),
                "decision": row["decision"],
                "priority": row["priority"],
                "owner": row["owner"],
                "deferred_reason": row["note"] if row["decision"] == "defer" else "",
                "decided_at": decided_at,
            }
        )
    return {
        "schemaVersion": "phase10-auditability-log/v1",
        "generatedAt": decided_at,
        "entryCount": len(entries),
        "entries": entries,
    }


def render_markdown(log_payload: dict[str, object]) -> str:
    lines: list[str] = []
    lines.append("# Phase 10 Auditability Log")
    lines.append("")
    lines.append(f"- Generated at: {log_payload['generatedAt']}")
    lines.append(f"- Entry count: {log_payload['entryCount']}")
    lines.append("")
    lines.append("| candidate_id | decision | priority | owner | deferred_reason |")
    lines.append("|---|---|---|---|---|")
    for row in log_payload["entries"]:
        lines.append(
            f"| {row['candidate_id']} | {row['decision']} | {row['priority']} | "
            f"{row['owner']} | {row['deferred_reason'] or '-'} |"
        )
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate Phase 10 auditability log from escalation decisions")
    parser.add_argument("--candidates", required=True, help="Path to escalation candidates JSON")
    parser.add_argument("--decisions", required=True, help="Path to decision array JSON")
    parser.add_argument("--output", required=True, help="Path to auditability log JSON")
    parser.add_argument("--markdown-output", help="Path to markdown summary")
    args = parser.parse_args()

    decided_at = _now_iso()
    try:
        candidates_by_id = parse_candidates(Path(args.candidates))
        decisions = parse_decisions(Path(args.decisions))
        log_payload = build_audit_log(candidates_by_id=candidates_by_id, decisions=decisions, decided_at=decided_at)
    except ValidationError as exc:
        print(f"NG: {exc}")
        return 1

    output_path = Path(args.output)
    markdown_path = Path(args.markdown_output) if args.markdown_output else output_path.with_suffix(".md")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(log_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    markdown_path.parent.mkdir(parents=True, exist_ok=True)
    markdown_path.write_text(render_markdown(log_payload), encoding="utf-8")
    print(f"OK: wrote auditability log -> {output_path}")
    print(f"OK: wrote auditability markdown -> {markdown_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
