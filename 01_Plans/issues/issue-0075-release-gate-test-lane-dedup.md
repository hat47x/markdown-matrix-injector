# Issue: Release gate test lane dedup for Phase9 sync

## Meta
- Type: Docs
- Status: Done
- Priority: Medium
- Scope: `01_Plans/tools/`, `01_Plans/issues/`
- Expected verification level: docs-check + unit

## Traceability
- Related Backlog/Phase: Phase 9 Rule Table Interoperability & Design Assetization
- Related ADR/Spec: `01_Plans/adr/ADR-0008-phase9-template-sync-quality-gate-hardening.md`

## Execution Plan
### Proposed solution (解決策の概要)
- release gate の G2 は `npm test` ではなく `npm run test:unit` を実行し、G3（Phase9Sync）と責務を分離する。
- 同じ sync checker の二重実行を避け、gate fail 時の原因特定を容易にする。

### Acceptance criteria (受入条件)
- [x] `release_gate_check.py` の G2 が `npm run test:unit` を実行する。
- [x] `test_release_gate_check.py` の期待メッセージが更新される。
- [x] `python3 01_Plans/tools/test_release_gate_check.py` が成功する。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時に orphan issue が 0 件である。

### Task breakdown (作業分解)
- [x] G2 実行コマンドを更新する。
- [x] unit test を更新する。
- [x] planning queue を再実行する。

### Validation plan (検証計画)
- `python3 01_Plans/tools/test_release_gate_check.py`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
- 2026-04-06: `python3 01_Plans/tools/test_release_gate_check.py`（19 tests, all passed）
- 2026-04-06: `python3 01_Plans/tools/planning_queue.py`（`issue_pending: 0`, `issue_orphan: 0`）
