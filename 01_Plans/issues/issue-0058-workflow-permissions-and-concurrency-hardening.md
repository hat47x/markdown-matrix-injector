# Issue: Workflow permissions and concurrency hardening for release gate operations

## Meta
- Type: Security
- Status: Done
- Priority: Medium
- Scope: `.github/workflows/ci.yml`, `.github/workflows/release-gate-manual.yml`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## Execution Plan
### Proposed solution (解決策の概要)
- release gate workflow の最小権限化と同時実行制御を追加し、運用中の競合実行と不要権限を抑制する。

### Acceptance criteria (受入条件)
- [x] CI workflow に `permissions: contents: read` が追加される。
- [x] CI workflow に concurrency 設定が追加され、同一 ref の重複実行が cancel される。
- [x] manual workflow に `permissions: contents: read` が追加される。
- [x] manual workflow に concurrency 設定が追加される。

### Task breakdown (作業分解)
- [x] CI workflow へ permissions/concurrency を追加する。
- [x] manual workflow へ permissions/concurrency を追加する。
- [x] 検証コマンドを実行し整合性を確認する。

### Validation plan (検証計画)
- `python3 -m unittest 01_Plans/tools/test_release_gate_check.py 01_Plans/tools/test_release_gate_metrics.py`
- `cd 03_Implement && npm run release:gate:full`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
### 2026-04-02 (UTC)
- Run date (UTC): `2026-04-02`
- Executor: `agent`
- Commands:
  - `python3 -m unittest 01_Plans/tools/test_release_gate_check.py 01_Plans/tools/test_release_gate_metrics.py`
  - `cd 03_Implement && npm run release:gate:full`
  - `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - CI/manual workflow に最小権限と concurrency を追加。
  - release gate コマンドとユニットテストは継続して成功。
  - planning queue は pending/orphan ともに 0 件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
