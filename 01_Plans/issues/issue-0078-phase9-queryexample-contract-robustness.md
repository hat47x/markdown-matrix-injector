# Issue: Phase 9 QueryExample contract robustness

## Meta
- Type: Docs
- Status: Done
- Priority: Medium
- Scope: `03_Implement/test/`, `01_Plans/issues/`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 9 Rule Table Interoperability & Design Assetization
- Related ADR/Spec: `01_Plans/adr/ADR-0008-phase9-template-sync-quality-gate-hardening.md`

## Execution Plan
### Proposed solution (解決策の概要)
- QueryExample contract test の入力前提（RuleId/QueryExample 非空）を明示チェックし、テスト失敗時の診断を改善する。
- RuleId マッチは正規表現エスケープを適用し、将来のID命名で記号が含まれても誤判定しないようにする。

### Acceptance criteria (受入条件)
- [x] `markdownMatrixPlugin.test.ts` が RuleId/QueryExample 空値を明示検知する。
- [x] RuleId マッチ判定が正規表現エスケープ付きになる。
- [x] `cd 03_Implement && npm test` が成功する。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時に orphan issue が 0 件である。

### Task breakdown (作業分解)
- [x] contract test を堅牢化する。
- [x] npm test と planning queue を実行する。

### Validation plan (検証計画)
- `cd 03_Implement && npm test`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
- 2026-04-06: `cd 03_Implement && npm test`（`test:unit` + `test:phase9-sync` ともに成功）
- 2026-04-06: `python3 01_Plans/tools/planning_queue.py`（`issue_pending: 0`, `issue_orphan: 0`）
