# Issue: Release gate metrics CSV generation for adoption observability

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `01_Plans/tools/release_gate_metrics.py`, `01_Plans/tools/test_release_gate_metrics.py`, `.github/workflows/ci.yml`, `.github/workflows/release-gate-manual.yml`, `04_Documentation/phase7-release-readiness.md`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## Execution Plan
### Proposed solution (解決策の概要)
- release gate JSON artifact から KPI 向け集計 CSV を自動生成し、CI/manual 実行の観測データを定型化する。

### Acceptance criteria (受入条件)
- [x] `release_gate_metrics.py` が追加される。
- [x] metrics script の unit test が追加される。
- [x] CI/manual workflow が `release-gate-metrics.csv` を生成して artifact upload する。
- [x] Phase 7 ガイドに metrics CSV の導線が追記される。

### Task breakdown (作業分解)
- [x] JSON -> CSV 変換スクリプトを作成する。
- [x] unittest を追加する。
- [x] workflow を更新する。
- [x] ガイド文書を更新する。

### Validation plan (検証計画)
- `python3 -m unittest 01_Plans/tools/test_release_gate_check.py 01_Plans/tools/test_release_gate_metrics.py`
- `cd 03_Implement && npm run release:gate:artifacts`
- `python3 01_Plans/tools/release_gate_metrics.py --input-file artifacts/release-gate.json --output-file artifacts/release-gate-metrics.csv`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
### 2026-04-02 (UTC)
- Run date (UTC): `2026-04-02`
- Executor: `agent`
- Commands:
  - `python3 -m unittest 01_Plans/tools/test_release_gate_check.py 01_Plans/tools/test_release_gate_metrics.py`
  - `cd 03_Implement && npm run release:gate:artifacts`
  - `python3 01_Plans/tools/release_gate_metrics.py --input-file artifacts/release-gate.json --output-file artifacts/release-gate-metrics.csv`
  - `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - release gate JSON から KPI 集計CSVを生成するスクリプトを追加。
  - CI/manual workflow が metrics CSV を artifact へ追加。
  - planning queue は pending/orphan ともに 0 件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
