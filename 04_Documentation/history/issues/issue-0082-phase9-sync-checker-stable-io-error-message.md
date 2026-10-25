# Issue: Phase 9同期検査のI/Oエラーメッセージを一定の文言に統一する

この文書は、Phase 9同期検査のI/Oエラーメッセージについて、当時の完了判断と検証結果を残したIssue記録です。実行証跡には日付の記載がなく、現行実装や実行環境で新たに動作を確認したものではありません。

## Meta
- Type: Tooling
- Status: Done
- Priority: Medium
- Scope: `03_Implement/tools/`, `04_Documentation/history/issues/`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 9 Rule Table Interoperability & Design Assetization
- Related ADR/Spec: `01_Plans/adr/ADR-0008-phase9-template-sync-quality-gate-hardening.md`

## 当時の実行計画
### 解決方針（当時の提案）
- CLIでI/Oエラーが発生した際は、OSごとに異なる例外の文字列をそのまま出力せず、`format_cli_exception`を通して一貫したエラーメッセージに整える。

### 受入条件（Acceptance criteria）
- [x] `check_phase9_template_sync.py` にCLI例外メッセージ整形関数が追加される。
- [x] ディレクトリ入力時のtext出力で安定した文言（`input path is a directory:`）が出力されることをテストで検証する。
- [x] ディレクトリ入力時のJSON出力でも安定した文言が `errors` に含まれることをテストで検証する。
- [x] `python3 03_Implement/tools/test_check_phase9_template_sync.py` が成功する。
- [x] `python3 03_Implement/tools/planning_queue.py` 実行時にorphan issueが0件である。

### 作業項目（Task breakdown）
- [x] CLI例外整形関数を実装する。
- [x] unit test / CLI契約テストを追加する。
- [x] テストとplanning queueを実行する。

### 当時の検証計画（Validation plan）
- `python3 03_Implement/tools/test_check_phase9_template_sync.py`
- `python3 03_Implement/tools/planning_queue.py`

## Validation evidence (実行証跡)
- `python3 03_Implement/tools/test_check_phase9_template_sync.py`
  - Ran 22 tests in 0.859s
  - OK
- `python3 03_Implement/tools/planning_queue.py`
  - issue_orphan: 0
