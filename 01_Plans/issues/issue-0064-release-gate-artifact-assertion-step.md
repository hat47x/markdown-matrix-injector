# Issue: Release-gate artifact assertion step

## Meta
- Type: Test
- Status: Done
- Priority: Medium
- Scope: `01_Plans/tools/release_gate_assert_artifacts.py`, `01_Plans/tools/test_release_gate_assert_artifacts.py`, `03_Implement/package.json`, `.github/workflows/release-gate-manual.yml`, `04_Documentation/phase7-release-readiness.md`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## Execution Plan
### Proposed solution (解決策の概要)
- release-gate full 実行の最後に artifact 存在チェックを追加し、upload 前に不足ファイルを即検知する。

### Acceptance criteria (受入条件)
- [x] `release_gate_assert_artifacts.py` が追加される。
- [x] assert script の unit test が追加される。
- [x] `release:gate:full` に assert step が組み込まれる。
- [x] manual workflow でも assert step が実行される。
- [x] Phase 7 ガイドに assert script 導線が追記される。

### Task breakdown (作業分解)
- [x] assert script 実装。
- [x] unit test 実装。
- [x] npm/manual workflow 更新。
- [x] 文書更新。

### Validation plan (検証計画)
- `cd 03_Implement && npm run test:release-gate-tools`
- `cd 03_Implement && npm run release:gate:full`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
### 2026-04-03 (UTC)
- Run date (UTC): `2026-04-03`
- Executor: `agent`
- Commands:
  - `cd 03_Implement && npm run test:release-gate-tools`
  - `cd 03_Implement && npm run release:gate:full`
  - `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - artifact assert script/test を追加。
  - full flow と manual workflow に assert を組み込み。
  - planning queue は pending/orphan ともに 0 件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
