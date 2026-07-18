# Issue: Release gate Phase9 sync explicit gate

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
- `release_gate_check.py` に Phase9 sync checker の明示ゲート（G3）を追加し、release gate report で独立観測できるようにする。
- test suite を更新し、ゲート順序・skip時挙動を固定化する。

### Acceptance criteria (受入条件)
- [x] `release_gate_check.py` に `G3:Phase9Sync` が追加される。
- [x] `test_release_gate_check.py` が 3ゲート順序と skip 時挙動を検証する。
- [x] `python3 01_Plans/tools/test_release_gate_check.py` が成功する。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時に orphan issue が 0 件である。

### Task breakdown (作業分解)
- [x] release gate ロジックを更新する。
- [x] unit test を更新する。
- [x] planning queue を再実行する。

### Validation plan (検証計画)
- `python3 01_Plans/tools/test_release_gate_check.py`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
- 2026-04-05: `python3 01_Plans/tools/test_release_gate_check.py`（15 tests, all passed）
- 2026-04-05: `python3 01_Plans/tools/planning_queue.py`（`issue_pending: 0`, `issue_orphan: 0`）
