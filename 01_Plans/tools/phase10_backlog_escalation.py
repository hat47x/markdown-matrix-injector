#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

import phase10_governance_report as governance_report


class ValidationError(ValueError):
    """Raised when escalation input or threshold is invalid."""


DEFAULT_THRESHOLDS = {
    "max_adoption_lead_time_hours": 24.0,
    "min_link_integrity_rate": 99.0,
    "min_print_reproducibility_rate": 98.0,
    "min_self_resolution_rate": 70.0,
    "max_sla_breach_count": 0.0,
}


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

    adoption = float(kpis["adoptionLeadTimeHours"])
    if adoption > thresholds["max_adoption_lead_time_hours"]:
        candidates.append(
            {
                "category": "kpi",
                "signal": "adoption_lead_time",
                "severity": "high",
                "summary": "導入時間が閾値を超過",
                "metric": _metric_payload(adoption, thresholds["max_adoption_lead_time_hours"], ">"),
                "suggested_owner": "author",
            }
        )

    link_rate = float(kpis["linkIntegrityDetectionRate"])
    if link_rate < thresholds["min_link_integrity_rate"]:
        candidates.append(
            {
                "category": "kpi",
                "signal": "link_integrity_detection_rate",
                "severity": "medium",
                "summary": "リンク不整合検知率が閾値を下回る",
                "metric": _metric_payload(link_rate, thresholds["min_link_integrity_rate"], "<"),
                "suggested_owner": "reviewer",
            }
        )

    print_rate = float(kpis["printReproducibilityRate"])
    if print_rate < thresholds["min_print_reproducibility_rate"]:
        candidates.append(
            {
                "category": "kpi",
                "signal": "print_reproducibility_rate",
                "severity": "high",
                "summary": "印刷再現性が閾値を下回る",
                "metric": _metric_payload(print_rate, thresholds["min_print_reproducibility_rate"], "<"),
                "suggested_owner": "delivery",
            }
        )

    self_resolution = float(kpis["selfResolutionRate"])
    if self_resolution < thresholds["min_self_resolution_rate"]:
        candidates.append(
            {
                "category": "kpi",
                "signal": "self_resolution_rate",
                "severity": "medium",
                "summary": "問い合わせ自己解決率が閾値を下回る",
                "metric": _metric_payload(self_resolution, thresholds["min_self_resolution_rate"], "<"),
                "suggested_owner": "reviewer",
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
    args = parser.parse_args()

    try:
        payload = governance_report.parse_input(Path(args.input))
        candidates = evaluate_candidates(payload, DEFAULT_THRESHOLDS)
        output = build_output(payload, candidates, DEFAULT_THRESHOLDS)
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
