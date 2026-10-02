# Issue: Phase 9 sync checker I/O error contract

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
- `check_phase9_template_sync.py` のCLI失敗契約に `OSError` 系（例: ディレクトリ指定）を追加し、I/Oエラー時も常に終了コード1 + 構造化エラー出力を返す。

### Acceptance criteria (受入条件)
- [x] CLIメイン処理が `OSError` を捕捉して `phase9 template sync: NG`（またはJSON `status=ng`）を返す。
- [x] ディレクトリパス指定時のテキスト出力契約テストが追加される。
- [x] ディレクトリパス指定時のJSON出力契約テストが追加される。
- [x] `python3 01_Plans/tools/test_check_phase9_template_sync.py` が成功する。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時にorphan issueが0件である。

### Task breakdown (作業分解)
- [x] CLIの例外処理に `OSError` を追加する。
- [x] CLI契約テストを2件追加する（text/json）。
- [x] テストとplanning queueを実行する。

### Validation plan (検証計画)
- `python3 01_Plans/tools/test_check_phase9_template_sync.py`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
- `python3 01_Plans/tools/test_check_phase9_template_sync.py`
  - Ran 21 tests in 0.895s
  - OK
- `python3 01_Plans/tools/planning_queue.py`
  - issue_orphan: 0
