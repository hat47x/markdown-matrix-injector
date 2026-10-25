#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

import phase10_governance_report as governance_report


class ValidationError(ValueError):
    """Raised when escalation input or threshold is invalid."""


# ADR-0012 D6: thresholds redefined around the new KPI set. Polarity per
# metric: displacedDuplicationCount is "higher is better" (a floor breach
# means duplication elimination has stalled), the other two are "lower is
# better" (a ceiling breach means drift/review-lag is excessive).
DEFAULT_THRESHOLDS = {
    "min_displaced_duplication_count": 1.0,
    "max_canon_drift_incident_count": 0.0,
    "max_table_change_review_lead_time_hours": 48.0,
    "max_sla_breach_count": 0.0,
}

THRESHOLD_KEYS = tuple(DEFAULT_THRESHOLDS.keys())


def _metric_payload(value: float, threshold: float, comparator: str) -> dict[str, object]:
    return {
        "value": round(value, 2),
        "threshold": round(threshold, 2),
        "comparator": comparator,
    }


def evaluate_candidates(payload: dict[str, object], thresholds: dict[str, float]) -> list[dict[str, object]]:
    kpis = payload["kpis"]
    breaches = payload["sla"]["breaches"]
    week = payload["week"]
    candidates: list[dict[str, object]] = []

    displaced_duplication = float(kpis["displacedDuplicationCount"])
    if displaced_duplication < thresholds["min_displaced_duplication_count"]:
        candidates.append(
            {
                "category": "kpi",
                "signal": "displaced_duplication_stalled",
                "severity": "medium",
                "summary": "駆逐されたコピー重複が閾値を下回った（重複解消が停滞）",
                "metric": _metric_payload(
                    displaced_duplication, thresholds["min_displaced_duplication_count"], "<"
                ),
                "suggested_owner": "author",
            }
        )

    canon_drift = float(kpis["canonDriftIncidentCount"])
    if canon_drift > thresholds["max_canon_drift_incident_count"]:
        candidates.append(
            {
                "category": "kpi",
                "signal": "canon_drift_incident_exceeded",
                "severity": "high",
                "summary": "正本と文書の乖離インシデントが閾値を超過した",
                "metric": _metric_payload(canon_drift, thresholds["max_canon_drift_incident_count"], ">"),
                "suggested_owner": "reviewer",
            }
        )

    review_lead_time = float(kpis["tableChangeReviewLeadTimeHours"])
    if review_lead_time > thresholds["max_table_change_review_lead_time_hours"]:
        candidates.append(
            {
                "category": "kpi",
                "signal": "table_change_review_lead_time_exceeded",
                "severity": "medium",
                "summary": "表変更のレビュー所要時間が閾値を超過した",
                "metric": _metric_payload(
                    review_lead_time, thresholds["max_table_change_review_lead_time_hours"], ">"
                ),
                "suggested_owner": "delivery",
            }
        )

    breach_count = float(len(breaches))
    if breach_count > thresholds["max_sla_breach_count"]:
        candidates.append(
            {
                "category": "sla",
                "signal": "sla_breach_count",
                "severity": "high",
                "summary": "SLA breach が検出された",
                "metric": _metric_payload(breach_count, thresholds["max_sla_breach_count"], ">"),
                "suggested_owner": "delivery",
            }
        )

    for index, candidate in enumerate(candidates, start=1):
        candidate["candidate_id"] = f"{week['label']}-{index:02d}"
    return candidates


def load_thresholds(path: Path | None) -> dict[str, float]:
    if path is None:
        return dict(DEFAULT_THRESHOLDS)

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValidationError(f"failed to read threshold json ({exc})") from exc
    if not isinstance(payload, dict):
        raise ValidationError("threshold json must be an object")

    thresholds = dict(DEFAULT_THRESHOLDS)
    for key in THRESHOLD_KEYS:
        if key not in payload:
            continue
        value = payload[key]
        if not isinstance(value, (int, float)):
            raise ValidationError(f"threshold {key} must be numeric")
        thresholds[key] = float(value)
    return thresholds


def build_output(payload: dict[str, object], candidates: list[dict[str, object]], thresholds: dict[str, float]) -> dict[str, object]:
    return {
        "schemaVersion": "phase10-backlog-escalation/v1",
        "generatedAt": payload["generatedAt"],
        "week": payload["week"],
        "thresholds": thresholds,
        "candidateCount": len(candidates),
        "candidates": candidates,
    }


def render_markdown(output: dict[str, object]) -> str:
    lines: list[str] = []
    week = output["week"]
    lines.append("# Phase 10 Backlog Escalation Candidates")
    lines.append("")
    lines.append(f"- Generated at: {output['generatedAt']}")
    lines.append(f"- Week: {week['label']} ({week['startDate']} to {week['endDate']})")
    lines.append(f"- Candidate count: {output['candidateCount']}")
    lines.append("")
    lines.append("## Candidates")
    lines.append("")
    if not output["candidates"]:
        lines.append("- No escalation candidates.")
        lines.append("")
        return "\n".join(lines)

    for candidate in output["candidates"]:
        metric = candidate["metric"]
        lines.append(
            f"- [ ] {candidate['candidate_id']} | {candidate['summary']} | "
            f"{metric['value']} {metric['comparator']} {metric['threshold']} "
            f"(owner: {candidate['suggested_owner']}, severity: {candidate['severity']})"
        )
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate Phase 10 backlog auto-escalation candidates")
    parser.add_argument("--input", required=True, help="Path to weekly governance input JSON")
    parser.add_argument("--output", required=True, help="Path to escalation candidates JSON")
    parser.add_argument("--markdown-output", help="Path to markdown summary output")
    parser.add_argument("--thresholds", help="Optional path to threshold override JSON")
    args = parser.parse_args()

    try:
        payload = governance_report.parse_input(Path(args.input))
        thresholds = load_thresholds(Path(args.thresholds) if args.thresholds else None)
        candidates = evaluate_candidates(payload, thresholds)
        output = build_output(payload, candidates, thresholds)
    except (OSError, json.JSONDecodeError, governance_report.ValidationError, ValidationError) as exc:
        print(f"NG: {exc}")
        return 1

    output_path = Path(args.output)
    markdown_path = Path(args.markdown_output) if args.markdown_output else output_path.with_suffix(".md")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    markdown_path.parent.mkdir(parents=True, exist_ok=True)
    markdown_path.write_text(render_markdown(output), encoding="utf-8")
    print(f"OK: wrote escalation candidates -> {output_path}")
    print(f"OK: wrote escalation summary -> {markdown_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
