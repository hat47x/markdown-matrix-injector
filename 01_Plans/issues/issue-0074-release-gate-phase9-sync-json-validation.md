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
- `evaluate_phase9_sync_gate` が return code だけでなく JSON payload の `status` を検証するよう強化する。
- release gate test に success/failure/json-parse-failure ケースを追加し、G3 判定の信頼性を高める。

### Acceptance criteria (受入条件)
- [x] `evaluate_phase9_sync_gate` が `status==ok` を検証し、`ng` や不正JSONを fail とする。
- [x] `test_release_gate_check.py` に G3 成功・失敗・JSON parse failure テストが追加される。
- [x] `python3 01_Plans/tools/test_release_gate_check.py` が成功する。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時に orphan issue が 0 件である。

### Task breakdown (作業分解)
- [x] G3 判定ロジックを更新する。
- [x] unit test を追加する。
- [x] planning queue を再実行する。

### Validation plan (検証計画)
- `python3 01_Plans/tools/test_release_gate_check.py`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
- 2026-04-06: `python3 01_Plans/tools/test_release_gate_check.py`（18 tests, all passed）
- 2026-04-06: `python3 01_Plans/tools/planning_queue.py`（`issue_pending: 0`, `issue_orphan: 0`）
