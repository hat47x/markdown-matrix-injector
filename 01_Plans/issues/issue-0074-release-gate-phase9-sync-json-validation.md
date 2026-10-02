# Issue: Release gate Phase9 sync JSON validation hardening

## Meta
- Type: Docs
- Status: Done
- Priority: High
- Scope: `01_Plans/tools/`, `01_Plans/issues/`
- Expected verification level: docs-check + unit

## Traceability
- Related Backlog/Phase: Phase 9 Rule Table Interoperability & Design Assetization
- Related ADR/Spec: `01_Plans/adr/ADR-0008-phase9-template-sync-quality-gate-hardening.md`

## Execution Plan
### Proposed solution (解決策の概要)
- `evaluate_phase9_sync_gate` がreturn codeだけでなくJSON payloadの `status` を検証するよう強化する。
- release gate testにsuccess/failure/json-parse-failureケースを追加し、G3判定の信頼性を高める。

### Acceptance criteria (受入条件)
- [x] `evaluate_phase9_sync_gate` が `status==ok` を検証し、`ng` や不正JSONをfailとする。
- [x] `test_release_gate_check.py` にG3成功・失敗・JSON parse failureテストが追加される。
- [x] `python3 01_Plans/tools/test_release_gate_check.py` が成功する。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時にorphan issueが0件である。

### Task breakdown (作業分解)
- [x] G3判定ロジックを更新する。
- [x] unit testを追加する。
- [x] planning queueを再実行する。

### Validation plan (検証計画)
- `python3 01_Plans/tools/test_release_gate_check.py`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
- 2026-04-06: `python3 01_Plans/tools/test_release_gate_check.py`（18 tests, all passed）
- 2026-04-06: `python3 01_Plans/tools/planning_queue.py`（`issue_pending: 0`, `issue_orphan: 0`）
