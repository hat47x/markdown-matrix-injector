# Issue: Phase 9 docs-fixture row parity check

## Meta
- Type: Docs
- Status: Done
- Priority: High
- Scope: `01_Plans/tools/`, `01_Plans/issues/`, `04_Documentation/`
- Expected verification level: docs-check + unit

## Traceability
- Related Backlog/Phase: Phase 9 Rule Table Interoperability & Design Assetization
- Related ADR/Spec: `01_Plans/adr/ADR-0008-phase9-template-sync-quality-gate-hardening.md`

## Execution Plan
### Proposed solution (解決策の概要)
- sync checker に docs/fixture の行内容一致（row parity）チェックを追加し、ヘッダ一致だけでは見抜けない内容差分を検知する。
- unit test に row parity 異常系を追加し、同期ルールの実効性を高める。

### Acceptance criteria (受入条件)
- [x] `check_phase9_template_sync.py` が docs/fixture 行差分を検知する。
- [x] `test_check_phase9_template_sync.py` に row parity 異常系が追加される。
- [x] `04_Documentation/phase9-rule-table-template-operations.md` に row parity 観点が追記される。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時に orphan issue が 0 件である。

### Task breakdown (作業分解)
- [x] row parity 検証ロジックを追加する。
- [x] unit test を追加する。
- [x] 運用ガイドを更新する。
- [x] planning queue を再実行する。

### Validation plan (検証計画)
- `python3 01_Plans/tools/test_check_phase9_template_sync.py`
- `python3 01_Plans/tools/check_phase9_template_sync.py`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
- 2026-04-05: `python3 01_Plans/tools/test_check_phase9_template_sync.py`（13 tests, all passed）
- 2026-04-05: `python3 01_Plans/tools/check_phase9_template_sync.py`（`phase9 template sync: OK`）
- 2026-04-05: `python3 01_Plans/tools/planning_queue.py`（`issue_pending: 0`, `issue_orphan: 0`）
