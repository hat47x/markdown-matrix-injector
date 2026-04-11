#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

ALLOWED_FAILURE_CATEGORIES = {"path", "sheet", "query", "render", "print", "unknown"}
ALLOWED_IMPACT_PERSONAS = {"author", "reviewer", "delivery"}
ALLOWED_GATES = {"docs-check", "unit", "integration", "phase9-sync"}

REQUIRED_BASE_KEYS = ("source", "gate", "status")


class ValidationError(ValueError):
    """Raised when harvest input does not satisfy the contract."""


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _require_string(scope: str, payload: dict[str, object], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValidationError(f"{scope}.{key} must be a non-empty string")
    return value.strip()


def _normalize_record(record: dict[str, object], *, source_path: Path, collected_at: str) -> dict[str, str]:
    scope = f"{source_path.name} record"
    for key in REQUIRED_BASE_KEYS:
        _require_string(scope, record, key)

    gate = _require_string(scope, record, "gate")
    if gate not in ALLOWED_GATES:
        raise ValidationError(f"{scope}.gate must be one of {sorted(ALLOWED_GATES)}")

    failure_category = record.get("failure_category", "unknown")
    if not isinstance(failure_category, str) or failure_category not in ALLOWED_FAILURE_CATEGORIES:
        raise ValidationError(
            f"{scope}.failure_category must be one of {sorted(ALLOWED_FAILURE_CATEGORIES)}"
        )

    impact_persona = record.get("impact_persona", "reviewer")
    if not isinstance(impact_persona, str) or impact_persona not in ALLOWED_IMPACT_PERSONAS:
        raise ValidationError(f"{scope}.impact_persona must be one of {sorted(ALLOWED_IMPACT_PERSONAS)}")

    normalized = {
        "source": _require_string(scope, record, "source"),
        "gate": gate,
        "status": _require_string(scope, record, "status").lower(),
        "failure_category": failure_category,
        "impact_persona": impact_persona,
        "collected_at": _require_string(scope, record, "collected_at") if "collected_at" in record else collected_at,
    }
    return normalized


def parse_records(path: Path, *, collected_at: str) -> list[dict[str, str]]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValidationError(f"{path}: failed to read JSON ({exc})") from exc

    if isinstance(payload, dict):
        records = [payload]
    elif isinstance(payload, list):
        records = payload
    else:
        raise ValidationError(f"{path}: top-level JSON must be an object or array")

    normalized: list[dict[str, str]] = []
    for record in records:
        if not isinstance(record, dict):
            raise ValidationError(f"{path}: each record must be an object")
        normalized.append(_normalize_record(record, source_path=path, collected_at=collected_at))
    return normalized


def harvest(inputs: Iterable[Path], *, collected_at: str | None = None) -> dict[str, object]:
    timestamp = collected_at or _now_iso()
    records: list[dict[str, str]] = []
    for input_path in inputs:
        records.extend(parse_records(input_path, collected_at=timestamp))

    return {
        "schemaVersion": "phase10-evidence-harvest/v1",
        "generatedAt": timestamp,
        "recordCount": len(records),
        "records": records,
    }


def build_governance_seed(harvest_artifact: dict[str, object]) -> dict[str, object]:
    records = harvest_artifact.get("records")
    if not isinstance(records, list):
        raise ValidationError("harvest artifact must include records[]")

    total = len(records)
    failures = 0
    known_failure = 0
    for record in records:
        if isinstance(record, dict):
            status = str(record.get("status", "")).lower()
            category = str(record.get("failure_category", "unknown"))
            if status != "pass":
                failures += 1
            if category != "unknown":
                known_failure += 1

    detection_rate = (known_failure / total * 100.0) if total else 100.0
    reproducibility = ((total - failures) / total * 100.0) if total else 100.0

    generated_at = str(harvest_artifact.get("generatedAt") or _now_iso())
    return {
        "generatedAt": generated_at,
        "week": {
            "label": "auto-generated",
            "startDate": "1970-01-01",
            "endDate": "1970-01-07",
        },
        "kpis": {
            "adoptionLeadTimeHours": 0.0,
            "linkIntegrityDetectionRate": round(detection_rate, 2),
            "printReproducibilityRate": round(reproducibility, 2),
            "selfResolutionRate": 0.0,
        },
        "sla": {
            "triageHours": 24,
            "workaroundHours": 72,
            "fixHours": 168,
            "breaches": [],
        },
        "nextActions": [],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Normalize gate JSON outputs into a Phase 10 harvest artifact")
    parser.add_argument("--inputs", nargs="+", required=True, help="Input JSON file(s) from gate execution")
    parser.add_argument("--output", help="Path to normalized harvest artifact JSON")
    parser.add_argument(
        "--governance-output",
        help="Optional path to output a governance-report-compatible seed JSON generated from the harvested artifact",
    )
    args = parser.parse_args()

    input_paths = [Path(raw) for raw in args.inputs]
    timestamp = _now_iso()
    output_path = Path(args.output) if args.output else Path("query-evidence") / f"phase10-evidence-harvest-{timestamp}.json"

    try:
        artifact = harvest(input_paths, collected_at=timestamp)
    except ValidationError as exc:
        print(f"NG: {exc}")
        return 1

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OK: wrote evidence harvest artifact -> {output_path}")

    if args.governance_output:
        governance_output_path = Path(args.governance_output)
        governance_seed = build_governance_seed(artifact)
        governance_output_path.parent.mkdir(parents=True, exist_ok=True)
        governance_output_path.write_text(
            json.dumps(governance_seed, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"OK: wrote governance seed -> {governance_output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
