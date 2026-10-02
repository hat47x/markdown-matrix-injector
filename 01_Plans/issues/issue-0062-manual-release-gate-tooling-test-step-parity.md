# Issue: Manual release-gate tooling test step parity with CI

## Meta
- Type: Test
- Status: Done
- Priority: Medium
- Scope: `.github/workflows/release-gate-manual.yml`, `04_Documentation/phase7-release-readiness.md`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## Execution Plan
### Proposed solution (解決策の概要)
- manual workflowにもtooling unit test stepを追加し、CIと同じ順序（tooling test -> gate run）へ統一する。

### Acceptance criteria (受入条件)
- [x] manual workflowに `npm run test:release-gate-tools` stepが追加される。
- [x] 既存のmanual flag入力とartifact uploadを維持する。
- [x] Phase 7ガイドにmanual workflowのtest stepが追記される。

### Task breakdown (作業分解)
- [x] workflow step追加。
- [x] 文書更新。
- [x] 検証実行と証跡記録。

### Validation plan (検証計画)
- `cd 03_Implement && npm run test:release-gate-tools`
- `cd 03_Implement && npm run release:gate:full`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
### 2026-04-02 (UTC)
- Run date (UTC): `2026-04-02`
- Executor: `agent`
- Commands:
  - `cd 03_Implement && npm run test:release-gate-tools`
  - `cd 03_Implement && npm run release:gate:full`
  - `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - manual workflowにtooling test stepを追加し、CIと同一順序へ統一。
  - manual flag / artifact uploadの既存仕様を維持。
  - planning queueはpending/orphanともに0件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
