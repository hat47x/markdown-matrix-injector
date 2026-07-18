# Issue: Phase 9 ignore-row-order CLI contract test

## Meta
- Type: Docs
- Status: Done
- Priority: Medium
- Scope: `01_Plans/tools/`, `01_Plans/issues/`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 9 Rule Table Interoperability & Design Assetization
- Related ADR/Spec: `01_Plans/adr/ADR-0008-phase9-template-sync-quality-gate-hardening.md`

## Execution Plan
### Proposed solution (解決策の概要)
- `--ignore-row-order` は現在関数レベルで検証済みのため、CLI経由の契約テストを追加して利用者視点の回帰を防ぐ。

### Acceptance criteria (受入条件)
- [x] `test_check_phase9_template_sync.py` に `--ignore-row-order` CLI 成功テストが追加される。
- [x] `test_check_phase9_template_sync.py` に `--ignore-row-order --format json` CLI 成功テストが追加される。
- [x] `test_check_phase9_template_sync.py` に `--ignore-row-order --format json` でも行内容不一致を検知する失敗テストが追加される。
- [x] `python3 01_Plans/tools/test_check_phase9_template_sync.py` が成功する。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時に orphan issue が 0 件である。

### Task breakdown (作業分解)
- [x] CLIテストを追加する。
- [x] テストと planning queue を実行する。

### Validation plan (検証計画)
- `python3 01_Plans/tools/test_check_phase9_template_sync.py`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
- `python3 01_Plans/tools/test_check_phase9_template_sync.py`
  - Ran 19 tests in 0.478s
  - OK
- `python3 01_Plans/tools/planning_queue.py`
  - issue_orphan: 0
