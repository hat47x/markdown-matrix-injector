# Issue: Phase 9 sync checker row-order option

## Meta
- Type: Docs
- Status: Done
- Priority: Medium
- Scope: `01_Plans/tools/`, `01_Plans/issues/`, `04_Documentation/`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 9 Rule Table Interoperability & Design Assetization
- Related ADR/Spec: `01_Plans/adr/ADR-0008-phase9-template-sync-quality-gate-hardening.md`

## Execution Plan
### Proposed solution (解決策の概要)
- sync checkerに `--ignore-row-order` を追加し、行集合が一致していれば順序差分を許容できる検証モードを提供する。
- 標準動作は従来どおり順序厳格（後方互換維持）とし、必要時のみオプション利用を許可する。

### Acceptance criteria (受入条件)
- [x] `check_phase9_template_sync.py` が `--ignore-row-order` を受け取る。
- [x] row mismatch判定がオプション時は順序非依存で評価される。
- [x] `test_check_phase9_template_sync.py` に順序差分許容のテストが追加される。
- [x] `phase9-rule-table-template-operations.md` にオプション利用手順が追記される。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時にorphan issueが0件である。

### Task breakdown (作業分解)
- [x] checkerとテストを更新する。
- [x] 運用ガイドを更新する。
- [x] planning queueを再実行する。

### Validation plan (検証計画)
- `python3 01_Plans/tools/test_check_phase9_template_sync.py`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
- 2026-04-06: `python3 01_Plans/tools/test_check_phase9_template_sync.py`（16 tests, all passed）
- 2026-04-06: `python3 01_Plans/tools/planning_queue.py`（`issue_pending: 0`, `issue_orphan: 0`）
