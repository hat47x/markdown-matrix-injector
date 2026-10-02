# Issue: Phase 7 issue rollup artifact automation

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `01_Plans/tools/phase7_issue_rollup.py`, `01_Plans/tools/test_phase7_issue_rollup.py`, `03_Implement/package.json`, `.github/workflows/ci.yml`, `.github/workflows/release-gate-manual.yml`, `04_Documentation/phase7-release-readiness.md`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## Execution Plan
### Proposed solution (解決策の概要)
- Phase 7のissueが増加して可視性が低下したため、ステータス一覧をMarkdown artifactとして自動生成する。

### Acceptance criteria (受入条件)
- [x] `phase7_issue_rollup.py` が追加される。
- [x] rollup scriptのunit testが追加される。
- [x] `release:gate:full` 実行でrollup artifactが生成される。
- [x] CI/manual workflowがrollup artifactをuploadする。
- [x] Phase 7ガイドへrollup artifact導線が追記される。

### Task breakdown (作業分解)
- [x] rollup script作成。
- [x] test作成。
- [x] npm/CI/manual workflow更新。
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
  - phase7 issue rollupを自動生成するscript/testを追加。
  - full flowとCI/manual artifactへrollupを組み込み。
  - planning queueはpending/orphanともに0件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
