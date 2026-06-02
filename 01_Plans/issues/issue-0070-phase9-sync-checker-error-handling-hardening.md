# Issue: Phase 9 sync checker error handling hardening

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
- sync checker がファイル未存在や空CSVなど例外でクラッシュせず、`phase9 template sync: NG` と明確な原因を返すようにする。
- unit test に CLI の missing-file 異常系を追加し、運用時の一次切り分け性を向上させる。

### Acceptance criteria (受入条件)
- [x] `check_phase9_template_sync.py` が FileNotFoundError / ValueError を捕捉して `NG` を返す。
- [x] `test_check_phase9_template_sync.py` に missing file 異常系が追加される。
- [x] `04_Documentation/phase9-rule-table-template-operations.md` に「ファイル未存在」時の一次対応が追記される。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時に orphan issue が 0 件である。

### Task breakdown (作業分解)
- [x] sync checker の例外処理を追加する。
- [x] CLI 異常系テストを追加する。
- [x] 運用ガイドを更新する。
- [x] planning queue を再実行する。

### Validation plan (検証計画)
- `python3 01_Plans/tools/test_check_phase9_template_sync.py`
- `python3 01_Plans/tools/check_phase9_template_sync.py --docs does-not-exist.csv --fixture does-not-exist.csv`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
- 2026-04-05: `python3 01_Plans/tools/test_check_phase9_template_sync.py`（12 tests, all passed）
- 2026-04-05: `python3 01_Plans/tools/check_phase9_template_sync.py --docs does-not-exist.csv --fixture does-not-exist.csv`（exit code 1, `phase9 template sync: NG` を確認）
- 2026-04-05: `python3 01_Plans/tools/planning_queue.py`（`issue_pending: 0`, `issue_orphan: 0`）
