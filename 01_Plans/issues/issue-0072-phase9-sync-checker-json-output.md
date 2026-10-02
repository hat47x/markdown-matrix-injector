# Issue: Phase 9 sync checker JSON output support

## Meta
- Type: Docs
- Status: Done
- Priority: Medium
- Scope: `01_Plans/tools/`, `01_Plans/issues/`, `04_Documentation/`
- Expected verification level: docs-check + unit

## Traceability
- Related Backlog/Phase: Phase 9 Rule Table Interoperability & Design Assetization
- Related ADR/Spec: `01_Plans/adr/ADR-0008-phase9-template-sync-quality-gate-hardening.md`

## Execution Plan
### Proposed solution (解決策の概要)
- sync checkerの結果をCIから機械可読で扱えるよう、`--format json` を追加する。
- text/jsonの両出力をunit testで検証し、運用ガイドにJSON利用手順を追記する。

### Acceptance criteria (受入条件)
- [x] `check_phase9_template_sync.py` が `--format text|json` を受け取り、json形式出力できる。
- [x] `test_check_phase9_template_sync.py` にJSON出力の正常系/異常系テストが追加される。
- [x] `phase9-rule-table-template-operations.md` にJSON出力手順が追記される。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時にorphan issueが0件である。

### Task breakdown (作業分解)
- [x] checkerにJSON出力を追加する。
- [x] unit testを追加する。
- [x] 運用ガイドを更新する。
- [x] planning queueを再実行する。

### Validation plan (検証計画)
- `python3 01_Plans/tools/test_check_phase9_template_sync.py`
- `python3 01_Plans/tools/check_phase9_template_sync.py --format json`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
- 2026-04-05: `python3 01_Plans/tools/test_check_phase9_template_sync.py`（15 tests, all passed）
- 2026-04-05: `python3 01_Plans/tools/check_phase9_template_sync.py --format json`（`{\"status\":\"ok\"...}` を確認）
- 2026-04-05: `python3 01_Plans/tools/planning_queue.py`（`issue_pending: 0`, `issue_orphan: 0`）
