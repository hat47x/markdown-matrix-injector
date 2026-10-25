#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

# ADR-0012 D6: KPI set redefined from adoption/link/print/self-resolution
# metrics to duplication-displacement / canon-drift / review-lead-time
# metrics. schemaVersion is new in v2 (v1 had none) so future breaking
# changes to this contract have a clean version to bump against.
SCHEMA_VERSION = "phase10-governance-report/v2"

REQUIRED_TOP_LEVEL_KEYS = (
    "schemaVersion",
    "generatedAt",
    "week",
    "kpis",
    "sla",
    "nextActions",
)

REQUIRED_WEEK_KEYS = ("label", "startDate", "endDate")
REQUIRED_KPI_KEYS = (
    "displacedDuplicationCount",
    "canonDriftIncidentCount",
    "tableChangeReviewLeadTimeHours",
)
# Pre-ADR-0012 KPI keys. Rejected explicitly (rather than silently accepted
# or ignored) so a payload built from the old phase7-release-readiness.md
# manual-entry habit fails loudly with a pointer to the new contract instead
# of either erroring on an unrelated missing-key message or, worse, silently
# producing a report with the wrong metrics.
LEGACY_KPI_KEYS = (
    "adoptionLeadTimeHours",
    "linkIntegrityDetectionRate",
    "printReproducibilityRate",
    "selfResolutionRate",
)
REQUIRED_SLA_KEYS = ("triageHours", "workaroundHours", "fixHours", "breaches")


class ValidationError(ValueError):
    """Raised when governance input does not satisfy the minimum contract."""


def _require_keys(scope: str, payload: dict[str, object], required_keys: tuple[str, ...]) -> None:
    missing = [key for key in required_keys if key not in payload]
    if missing:
        missing_csv = ", ".join(missing)
        raise ValidationError(f"{scope} missing required key(s): {missing_csv}")


def _require_number(scope: str, payload: dict[str, object], key: str) -> float:
    value = payload.get(key)
    if not isinstance(value, (int, float)):
        raise ValidationError(f"{scope}.{key} must be a number")
    return float(value)


def _require_string(scope: str, payload: dict[str, object], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValidationError(f"{scope}.{key} must be a non-empty string")
    return value


def parse_input(path: Path) -> dict[str, object]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)

    if not isinstance(payload, dict):
        raise ValidationError("top-level JSON must be an object")

    _require_keys("root", payload, REQUIRED_TOP_LEVEL_KEYS)

    schema_version = payload["schemaVersion"]
    if schema_version != SCHEMA_VERSION:
        raise ValidationError(f"unsupported schemaVersion: {schema_version!r} (expected {SCHEMA_VERSION!r})")

    week = payload["week"]
    kpis = payload["kpis"]
    sla = payload["sla"]
    next_actions = payload["nextActions"]

    if not isinstance(week, dict):
        raise ValidationError("week must be an object")
    if not isinstance(kpis, dict):
        raise ValidationError("kpis must be an object")
    if not isinstance(sla, dict):
        raise ValidationError("sla must be an object")
    if not isinstance(next_actions, list):
        raise ValidationError("nextActions must be an array")

    legacy_present = sorted(key for key in LEGACY_KPI_KEYS if key in kpis)
    if legacy_present:
        raise ValidationError(
            f"kpis contains legacy field(s) {legacy_present}; superseded by ADR-0012 D6, "
            "see 04_Documentation/process/phase10-governance-reporting-foundation.md"
        )

    _require_keys("week", week, REQUIRED_WEEK_KEYS)
    _require_keys("kpis", kpis, REQUIRED_KPI_KEYS)
    _require_keys("sla", sla, REQUIRED_SLA_KEYS)

    _require_string("root", payload, "generatedAt")
    for key in REQUIRED_WEEK_KEYS:
        _require_string("week", week, key)

    for key in REQUIRED_KPI_KEYS:
        _require_number("kpis", kpis, key)

    for key in ("triageHours", "workaroundHours", "fixHours"):
        _require_number("sla", sla, key)

    breaches = sla["breaches"]
    if not isinstance(breaches, list):
        raise ValidationError("sla.breaches must be an array")

    for index, action in enumerate(next_actions, start=1):
        if not isinstance(action, dict):
            raise ValidationError(f"nextActions[{index}] must be an object")
        for field in ("summary", "owner", "dueDate", "source"):
            _require_string(f"nextActions[{index}]", action, field)

    for index, breach in enumerate(breaches, start=1):
        if not isinstance(breach, dict):
            raise ValidationError(f"sla.breaches[{index}] must be an object")
        for field in ("ticketId", "stage", "owner", "note"):
            _require_string(f"sla.breaches[{index}]", breach, field)
        _require_number(f"sla.breaches[{index}]", breach, "elapsedHours")

    return payload


def render_markdown(payload: dict[str, object]) -> str:
    week = payload["week"]
    kpis = payload["kpis"]
    sla = payload["sla"]
    next_actions = payload["nextActions"]
    breaches = sla["breaches"]

    lines: list[str] = []
    lines.append("# Weekly Governance Report")
    lines.append("")
    lines.append(
        f"- Generated at: {payload['generatedAt']}  ")
    lines.append(
        f"- Reporting week: {week['label']} ({week['startDate']} to {week['endDate']})"
    )
    lines.append("")
    lines.append("## KPI Summary")
    lines.append("")
    lines.append("| KPI | Value |")
    lines.append("|---|---:|")
    lines.append(f"| Displaced copy-paste duplication (count) | {int(kpis['displacedDuplicationCount'])} |")
    lines.append(f"| Canon-vs-document drift incidents (count) | {int(kpis['canonDriftIncidentCount'])} |")
    lines.append(f"| Table-change review lead time (hours) | {kpis['tableChangeReviewLeadTimeHours']:.1f} |")
    lines.append("")
    lines.append("## SLA Alerts")
    lines.append("")
    lines.append(
        "- Target SLA: "
        f"triage <= {int(sla['triageHours'])}h, "
        f"workaround <= {int(sla['workaroundHours'])}h, "
        f"fix <= {int(sla['fixHours'])}h"
    )

    if not breaches:
        lines.append("- No SLA breaches detected this week.")
    else:
        lines.append("- Breaches detected:")
        for breach in breaches:
            lines.append(
                "  - "
                f"{breach['ticketId']} / {breach['stage']} / {breach['elapsedHours']:.1f}h "
                f"(owner: {breach['owner']}) - {breach['note']}"
            )

    lines.append("")
    lines.append("## Next Actions")
    lines.append("")
    if not next_actions:
        lines.append("- No new actions proposed.")
    else:
        for action in next_actions:
            lines.append(
                f"- [ ] {action['summary']} (owner: {action['owner']}, due: {action['dueDate']}, source: {action['source']})"
            )

    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate Phase 10 weekly governance markdown report")
    parser.add_argument("--input", required=True, help="Path to governance input JSON")
    parser.add_argument("--output", required=True, help="Path to output markdown report")
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    try:
        payload = parse_input(input_path)
    except (OSError, json.JSONDecodeError, ValidationError) as exc:
        print(f"NG: {exc}")
        return 1

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(render_markdown(payload), encoding="utf-8")
    print(f"OK: wrote governance report -> {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
