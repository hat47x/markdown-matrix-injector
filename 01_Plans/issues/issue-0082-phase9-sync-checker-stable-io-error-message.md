# Issue: Phase 9 sync checker stable I/O error message contract

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
- CLIのI/O失敗時メッセージをOS依存の生文字列任せにせず、`format_cli_exception` で安定したエラー文言へ正規化する。

### Acceptance criteria (受入条件)
- [x] `check_phase9_template_sync.py` にCLI例外メッセージ整形関数が追加される。
- [x] ディレクトリ入力時のtext出力で安定した文言（`input path is a directory:`）が出力されることをテストで検証する。
- [x] ディレクトリ入力時のJSON出力でも安定した文言が `errors` に含まれることをテストで検証する。
- [x] `python3 01_Plans/tools/test_check_phase9_template_sync.py` が成功する。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時にorphan issueが0件である。

### Task breakdown (作業分解)
- [x] CLI例外整形関数を実装する。
- [x] unit test / CLI契約テストを追加する。
- [x] テストとplanning queueを実行する。

### Validation plan (検証計画)
- `python3 01_Plans/tools/test_check_phase9_template_sync.py`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
- `python3 01_Plans/tools/test_check_phase9_template_sync.py`
  - Ran 22 tests in 0.859s
  - OK
- `python3 01_Plans/tools/planning_queue.py`
  - issue_orphan: 0
