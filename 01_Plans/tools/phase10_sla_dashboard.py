#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

ALLOWED_FAILURE_CATEGORIES = {"path", "sheet", "query", "render", "print", "unknown"}
ALLOWED_IMPACT_PERSONAS = {"author", "reviewer", "delivery"}
ALLOWED_STAGES = ("triage", "workaround", "fix")
SLA_HOURS_BY_STAGE = {"triage": 24, "workaround": 72, "fix": 168}


class ValidationError(ValueError):
    """Raised when SLA dashboard input is invalid."""


@dataclass(frozen=True)
class DashboardEntry:
    source: str
    gate: str
    status: str
    failure_category: str
    impact_persona: str
    collected_at: str
    sla_stage: str
    sla_deadline: str
    sla_state: str
    elapsed_hours: float

    def as_dict(self) -> dict[str, object]:
        return {
            "source": self.source,
            "gate": self.gate,
            "status": self.status,
            "failure_category": self.failure_category,
            "impact_persona": self.impact_persona,
            "collected_at": self.collected_at,
            "sla_stage": self.sla_stage,
            "sla_deadline": self.sla_deadline,
            "sla_state": self.sla_state,
            "elapsed_hours": self.elapsed_hours,
        }


def _now_utc() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def _to_iso(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


def _parse_iso(value: str, *, field_name: str) -> datetime:
    normalized = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise ValidationError(f"{field_name} must be an ISO8601 datetime") from exc
    if parsed.tzinfo is None:
        raise ValidationError(f"{field_name} must include timezone information")
    return parsed.astimezone(timezone.utc)


def _require_string(scope: str, payload: dict[str, object], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValidationError(f"{scope}.{key} must be a non-empty string")
    return value.strip()


def parse_harvest_artifact(path: Path) -> list[dict[str, str]]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValidationError(f"{path}: failed to read JSON ({exc})") from exc

    if not isinstance(payload, dict):
        raise ValidationError("harvest artifact top-level JSON must be an object")

    records = payload.get("records")
    if not isinstance(records, list):
        raise ValidationError("harvest artifact must include records[]")

    normalized: list[dict[str, str]] = []
    for index, record in enumerate(records, start=1):
        if not isinstance(record, dict):
            raise ValidationError(f"records[{index}] must be an object")
        scope = f"records[{index}]"
        failure_category = _require_string(scope, record, "failure_category")
        if failure_category not in ALLOWED_FAILURE_CATEGORIES:
            raise ValidationError(f"{scope}.failure_category must be one of {sorted(ALLOWED_FAILURE_CATEGORIES)}")
        impact_persona = _require_string(scope, record, "impact_persona")
        if impact_persona not in ALLOWED_IMPACT_PERSONAS:
            raise ValidationError(f"{scope}.impact_persona must be one of {sorted(ALLOWED_IMPACT_PERSONAS)}")
        collected_at = _require_string(scope, record, "collected_at")
        _parse_iso(collected_at, field_name=f"{scope}.collected_at")
        normalized.append(
            {
                "source": _require_string(scope, record, "source"),
                "gate": _require_string(scope, record, "gate"),
                "status": _require_string(scope, record, "status").lower(),
                "failure_category": failure_category,
                "impact_persona": impact_persona,
                "collected_at": collected_at,
            }
        )
    return normalized


def evaluate_dashboard(
    records: list[dict[str, str]],
    *,
    now: datetime | None = None,
) -> dict[str, object]:
    now_utc = now or _now_utc()
    generated_at = _to_iso(now_utc)
    entries: list[DashboardEntry] = []
    overdue_by_stage: Counter[str] = Counter()
    overdue_breakdown: Counter[tuple[str, str]] = Counter()

    for record in records:
        collected_dt = _parse_iso(record["collected_at"], field_name="record.collected_at")
        elapsed_hours = max((now_utc - collected_dt).total_seconds() / 3600.0, 0.0)
        has_failure = record["status"] != "pass"
        for stage in ALLOWED_STAGES:
            deadline_dt = collected_dt + timedelta(hours=SLA_HOURS_BY_STAGE[stage])
            is_overdue = has_failure and elapsed_hours > SLA_HOURS_BY_STAGE[stage]
            state = "overdue" if is_overdue else "within_sla"
            entry = DashboardEntry(
                source=record["source"],
                gate=record["gate"],
                status=record["status"],
                failure_category=record["failure_category"],
                impact_persona=record["impact_persona"],
                collected_at=record["collected_at"],
                sla_stage=stage,
                sla_deadline=_to_iso(deadline_dt),
                sla_state=state,
                elapsed_hours=round(elapsed_hours, 2),
            )
            entries.append(entry)
            if is_overdue:
                overdue_by_stage[stage] += 1
                overdue_breakdown[(record["failure_category"], record["impact_persona"])] += 1

    breakdown_rows = [
        {
            "failure_category": failure_category,
            "impact_persona": impact_persona,
            "count": count,
        }
        for (failure_category, impact_persona), count in sorted(overdue_breakdown.items())
    ]

    return {
        "schemaVersion": "phase10-sla-dashboard/v1",
        "generatedAt": generated_at,
        "slaTargetsHours": dict(SLA_HOURS_BY_STAGE),
        "recordCount": len(entries),
        "overdueCount": sum(overdue_by_stage.values()),
        "overdueByStage": {stage: overdue_by_stage.get(stage, 0) for stage in ALLOWED_STAGES},
        "overdueBreakdown": breakdown_rows,
        "records": [entry.as_dict() for entry in entries],
    }


def render_markdown_summary(dashboard: dict[str, object]) -> str:
    lines: list[str] = []
    lines.append("# Phase 10 SLA Dashboard Summary")
    lines.append("")
    lines.append(f"- Generated at: {dashboard['generatedAt']}")
    lines.append(f"- 期限超過件数: {dashboard['overdueCount']}")
    lines.append("")
    lines.append("## 超過内訳（failure_category x impact_persona）")
    lines.append("")
    lines.append("| failure_category | impact_persona | count |")
    lines.append("|---|---|---:|")
    rows = dashboard["overdueBreakdown"]
    if not rows:
        lines.append("| - | - | 0 |")
    else:
        for row in rows:
            lines.append(
                f"| {row['failure_category']} | {row['impact_persona']} | {row['count']} |"
            )
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate Phase 10 SLA dashboard seed and markdown summary")
    parser.add_argument("--input", required=True, help="Path to phase10 evidence harvest JSON")
    parser.add_argument("--output", required=True, help="Path to SLA dashboard JSON")
    parser.add_argument(
        "--markdown-output",
        help="Optional path to markdown summary output (default: same as --output with .md suffix)",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)
    markdown_path = Path(args.markdown_output) if args.markdown_output else output_path.with_suffix(".md")

    try:
        records = parse_harvest_artifact(input_path)
        dashboard = evaluate_dashboard(records)
    except ValidationError as exc:
        print(f"NG: {exc}")
        return 1

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(dashboard, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    markdown_path.parent.mkdir(parents=True, exist_ok=True)
    markdown_path.write_text(render_markdown_summary(dashboard), encoding="utf-8")

    print(f"OK: wrote SLA dashboard -> {output_path}")
    print(f"OK: wrote SLA markdown summary -> {markdown_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
