# Issue: Phase 9 sync checker stable empty-csv and missing-file error contract

## Meta
- Type: Tooling
- Status: Done
- Priority: Medium
- Scope: `01_Plans/tools/`, `01_Plans/issues/`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 9 Rule Table Interoperability & Design Assetization
- Related ADR/Spec: `01_Plans/adr/ADR-0008-phase9-template-sync-quality-gate-hardening.md`

## Execution Plan
### Proposed solution (解決策の概要)
- `format_cli_exception` で `ValueError("empty csv: ...")` と `FileNotFoundError` のメッセージを安定化し、text/jsonどちらでも契約検証しやすい表現へ統一する。

### Acceptance criteria (受入条件)
- [x] `ValueError("empty csv: ...")` が `input csv is empty: ...` に正規化される。
- [x] `FileNotFoundError` が `input file not found: ...` に正規化される。
- [x] ファイル欠落時のtext出力で安定文言を検証するテストがある。
- [x] ファイル欠落時のJSON出力で安定文言を検証するテストがある。
- [x] 空CSV時のJSON出力で安定文言を検証するテストがある。
- [x] `python3 01_Plans/tools/test_check_phase9_template_sync.py` が成功する。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時にorphan issueが0件である。

### Task breakdown (作業分解)
- [x] 例外正規化ロジックを拡張する。
- [x] unit/CLI契約テストを追加する。
- [x] テストとplanning queueを実行する。

### Validation plan (検証計画)
- `python3 01_Plans/tools/test_check_phase9_template_sync.py`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
- `python3 01_Plans/tools/test_check_phase9_template_sync.py`
  - Ran 25 tests in 0.736s
  - OK
- `python3 01_Plans/tools/planning_queue.py`
  - issue_orphan: 0
