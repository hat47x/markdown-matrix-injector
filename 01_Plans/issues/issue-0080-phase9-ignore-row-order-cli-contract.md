# Issue: Phase 9の行順序無視オプションをCLI経由で契約テストする

この文書は、当時の関数レベルの検証をCLI操作へ広げる方針と完了判断を残したIssue記録です。検証証跡には実行日が記載されておらず、現行のCLI動作を新たに確認したものではありません。

## Meta
- Type: Docs
- Status: Done
- Priority: Medium
- Scope: `01_Plans/tools/`, `01_Plans/issues/`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 9 Rule Table Interoperability & Design Assetization
- Related ADR/Spec: `01_Plans/adr/ADR-0008-phase9-template-sync-quality-gate-hardening.md`

## 当時の実行計画
### 解決方針（当時の提案）
- `--ignore-row-order`について、当時の関数レベルでの検証に加えてCLI経由の契約テストを用意し、利用者がコマンドとして実行した場合の動作を回帰テストで確認できるようにする。

### 受入条件（Acceptance criteria）
- [x] `test_check_phase9_template_sync.py` に `--ignore-row-order` CLI成功テストが追加される。
- [x] `test_check_phase9_template_sync.py` に `--ignore-row-order --format json` CLI成功テストが追加される。
- [x] `test_check_phase9_template_sync.py` に `--ignore-row-order --format json` でも行内容不一致を検知する失敗テストが追加される。
- [x] `python3 01_Plans/tools/test_check_phase9_template_sync.py` が成功する。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時にorphan issueが0件である。

### 作業項目（Task breakdown）
- [x] CLIテストを追加する。
- [x] テストとplanning queueを実行する。

### 当時の検証計画（Validation plan）
- `python3 01_Plans/tools/test_check_phase9_template_sync.py`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
- `python3 01_Plans/tools/test_check_phase9_template_sync.py`
  - Ran 19 tests in 0.478s
  - OK
- `python3 01_Plans/tools/planning_queue.py`
  - issue_orphan: 0
