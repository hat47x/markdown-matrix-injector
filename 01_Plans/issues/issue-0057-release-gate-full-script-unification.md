# Issue: Release gate full script unification across CI and local runs

## Meta
- Type: Refactor
- Status: Done
- Priority: Medium
- Scope: `03_Implement/package.json`, `.github/workflows/ci.yml`, `.github/workflows/release-gate-manual.yml`, `04_Documentation/phase7-release-readiness.md`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## Execution Plan
### Proposed solution (解決策の概要)
- release gate本体 + metrics生成を1つのnpm script (`release:gate:full`) へ統合し、CI/local/manualの実行差異を最小化する。

### Acceptance criteria (受入条件)
- [x] `03_Implement/package.json` に `release:gate:full` が追加される。
- [x] CI release-gate jobが `npm run release:gate:full` を使う。
- [x] manual workflowが `repo-root ..` 前提で同等の出力を維持する。
- [x] Phase 7ガイドに `release:gate:full` の導線が追記される。

### Task breakdown (作業分解)
- [x] package scripts追加。
- [x] CI workflowのステップ簡素化。
- [x] manual workflowのコマンド整列。
- [x] ガイド更新と証跡記録。

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
  - release gate + metricsを単一npm scriptに統合。
  - CI/manualとローカルの実行導線を揃えた。
  - planning queueはpending/orphanともに0件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
