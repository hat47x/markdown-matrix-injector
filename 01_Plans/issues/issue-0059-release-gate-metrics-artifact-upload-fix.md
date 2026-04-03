# Issue: Release gate metrics artifact upload fix for CI/manual workflows

## Meta
- Type: Bugfix
- Status: Done
- Priority: High
- Scope: `.github/workflows/ci.yml`, `.github/workflows/release-gate-manual.yml`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## Execution Plan
### Proposed solution (解決策の概要)
- metrics CSV は生成されているが artifact upload 対象から漏れていたため、CI/manual workflow の upload path へ `artifacts/release-gate-metrics.csv` を追加する。

### Acceptance criteria (受入条件)
- [x] `ci.yml` の release-gate artifact path に metrics CSV が含まれる。
- [x] `release-gate-manual.yml` の artifact path に metrics CSV が含まれる。
- [x] ローカル検証コマンドが継続して成功する。

### Task breakdown (作業分解)
- [x] CI workflow の upload path を修正する。
- [x] manual workflow の upload path を修正する。
- [x] 検証コマンドを実行し証跡を記録する。

### Validation plan (検証計画)
- `cd 03_Implement && npm run release:gate:full`
- `python3 -m unittest 01_Plans/tools/test_release_gate_check.py 01_Plans/tools/test_release_gate_metrics.py`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
### 2026-04-02 (UTC)
- Run date (UTC): `2026-04-02`
- Executor: `agent`
- Commands:
  - `cd 03_Implement && npm run release:gate:full`
  - `python3 -m unittest 01_Plans/tools/test_release_gate_check.py 01_Plans/tools/test_release_gate_metrics.py`
  - `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - CI/manual workflow の artifact upload に metrics CSV を追加。
  - release-gate full とユニットテストの成功を確認。
  - planning queue は pending/orphan ともに 0 件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
