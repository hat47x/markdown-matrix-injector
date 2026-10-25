#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import phase10_auditability_log as audit_log
import phase10_artifact_manifest as artifact_manifest
import phase10_backlog_escalation as escalation
import phase10_evidence_harvest as harvest
import phase10_governance_report as governance_report
import phase10_sla_dashboard as sla_dashboard


class ValidationError(ValueError):
    """Raised when governance pipeline inputs are invalid."""


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def run_pipeline(
    *,
    gate_inputs: list[Path],
    decisions_path: Path,
    output_dir: Path,
    thresholds_path: Path | None = None,
    manual_kpis_path: Path | None = None,
) -> dict[str, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)

    collected_at = _now_iso()
    artifact = harvest.harvest(gate_inputs, collected_at=collected_at)
    harvest_path = output_dir / "phase10-evidence-harvest.json"
    harvest_path.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    manual_kpis = harvest.load_manual_kpis(manual_kpis_path)
    governance_seed = harvest.build_governance_seed(artifact, manual_kpis=manual_kpis)
    governance_seed_path = output_dir / "phase10-governance-seed.json"
    governance_seed_path.write_text(json.dumps(governance_seed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    report_md = governance_report.render_markdown(governance_seed)
    governance_report_path = output_dir / "phase10-governance-report.md"
    governance_report_path.write_text(report_md, encoding="utf-8")

    records = sla_dashboard.parse_harvest_artifact(harvest_path)
    sla_payload = sla_dashboard.evaluate_dashboard(records)
    sla_json_path = output_dir / "phase10-sla-dashboard.json"
    sla_md_path = output_dir / "phase10-sla-dashboard.md"
    sla_json_path.write_text(json.dumps(sla_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    sla_md_path.write_text(sla_dashboard.render_markdown_summary(sla_payload), encoding="utf-8")

    thresholds = escalation.load_thresholds(thresholds_path)
    candidates = escalation.evaluate_candidates(governance_seed, thresholds)
    escalation_payload = escalation.build_output(governance_seed, candidates, thresholds)
    escalation_json_path = output_dir / "phase10-escalation-candidates.json"
    escalation_md_path = output_dir / "phase10-escalation-candidates.md"
    escalation_json_path.write_text(json.dumps(escalation_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    escalation_md_path.write_text(escalation.render_markdown(escalation_payload), encoding="utf-8")

    decisions = audit_log.parse_decisions(decisions_path)
    candidates_by_id = audit_log.parse_candidates(escalation_json_path)
    audit_payload = audit_log.build_audit_log(
        candidates_by_id=candidates_by_id,
        decisions=decisions,
        decided_at=_now_iso(),
    )
    audit_json_path = output_dir / "phase10-auditability-log.json"
    audit_md_path = output_dir / "phase10-auditability-log.md"
    audit_json_path.write_text(json.dumps(audit_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    audit_md_path.write_text(audit_log.render_markdown(audit_payload), encoding="utf-8")

    manifest_payload = artifact_manifest.build_manifest(output_dir)
    manifest_json_path = output_dir / "phase10-artifact-manifest.json"
    manifest_md_path = output_dir / "phase10-artifact-manifest.md"
    manifest_json_path.write_text(json.dumps(manifest_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    manifest_md_path.write_text(artifact_manifest.render_markdown(manifest_payload), encoding="utf-8")

    return {
        "harvest": harvest_path,
        "governance_seed": governance_seed_path,
        "governance_report": governance_report_path,
        "sla_dashboard": sla_json_path,
        "sla_markdown": sla_md_path,
        "escalation_candidates": escalation_json_path,
        "escalation_markdown": escalation_md_path,
        "audit_log": audit_json_path,
        "audit_markdown": audit_md_path,
        "artifact_manifest": manifest_json_path,
        "artifact_manifest_markdown": manifest_md_path,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Phase 10 governance automation pipeline end-to-end")
    parser.add_argument("--gate-inputs", nargs="+", required=True, help="Gate JSON file(s) for evidence harvest")
    parser.add_argument("--decisions", required=True, help="Decision JSON array for auditability logging")
    parser.add_argument("--output-dir", required=True, help="Directory for all generated artifacts")
    parser.add_argument("--thresholds", help="Optional escalation threshold override JSON")
    parser.add_argument(
        "--manual-kpis-file",
        help="Optional path to a JSON object of manually recorded ADR-0012 D6 KPI values, "
        "forwarded to the evidence-harvest governance seed step",
    )
    args = parser.parse_args()

    gate_paths = [Path(raw) for raw in args.gate_inputs]
    decisions_path = Path(args.decisions)
    output_dir = Path(args.output_dir)
    thresholds_path = Path(args.thresholds) if args.thresholds else None
    manual_kpis_path = Path(args.manual_kpis_file) if args.manual_kpis_file else None
    try:
        outputs = run_pipeline(
            gate_inputs=gate_paths,
            decisions_path=decisions_path,
            output_dir=output_dir,
            thresholds_path=thresholds_path,
            manual_kpis_path=manual_kpis_path,
        )
    except (
        OSError,
        json.JSONDecodeError,
        harvest.ValidationError,
        governance_report.ValidationError,
        sla_dashboard.ValidationError,
        escalation.ValidationError,
        audit_log.ValidationError,
        artifact_manifest.ValidationError,
        ValidationError,
    ) as exc:
        print(f"NG: {exc}")
        return 1

    print("OK: generated phase10 governance pipeline artifacts")
    for key, path in outputs.items():
        print(f"- {key}: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
