# Issue: Release-gate tooling unit test step in CI

## Meta
- Type: Test
- Status: Done
- Priority: Medium
- Scope: `03_Implement/package.json`, `.github/workflows/ci.yml`, `04_Documentation/phase7-release-readiness.md`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## Execution Plan
### Proposed solution (解決策の概要)
- release-gate 本実行前に tooling unit tests を CI で明示実行し、ゲート実行ユーティリティの回帰を早期検知する。

### Acceptance criteria (受入条件)
- [x] `03_Implement/package.json` に tooling test 実行スクリプトが追加される。
- [x] CI release-gate job が `npm run test:release-gate-tools` を実行する。
- [x] Phase 7 ガイドに test step が反映される。

### Task breakdown (作業分解)
- [x] npm script 追加。
- [x] CI step 追加。
- [x] ドキュメント更新。
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
  - release-gate tooling テストを npm script 化。
  - CI release-gate job が tooling test -> full gate の順で実行するよう更新。
  - planning queue は pending/orphan ともに 0 件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
