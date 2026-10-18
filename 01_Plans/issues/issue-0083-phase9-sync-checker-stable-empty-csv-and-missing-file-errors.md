# Issue: Phase 9同期検査で空CSVとファイル不在のエラー表示を統一する

この文書は、空CSVとファイル不在時のCLIエラー表示について、当時の完了判断と検証結果を残したIssue記録です。実行証跡には日付の記載がなく、現行のCLI出力を新たに検証したものではありません。

## Meta
- Type: Tooling
- Status: Done
- Priority: Medium
- Scope: `01_Plans/tools/`, `01_Plans/issues/`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 9 Rule Table Interoperability & Design Assetization
- Related ADR/Spec: `01_Plans/adr/ADR-0008-phase9-template-sync-quality-gate-hardening.md`

## 当時の実行計画
### 解決方針（当時の提案）
- `format_cli_exception`で`ValueError("empty csv: ...")`と`FileNotFoundError`のメッセージを正規化し、テキスト形式とJSON形式のどちらでも、契約テストで確認しやすい一定の表現にそろえる。

### 受入条件（Acceptance criteria）
- [x] `ValueError("empty csv: ...")` が `input csv is empty: ...` に正規化される。
- [x] `FileNotFoundError` が `input file not found: ...` に正規化される。
- [x] ファイル欠落時のtext出力で安定文言を検証するテストがある。
- [x] ファイル欠落時のJSON出力で安定文言を検証するテストがある。
- [x] 空CSV時のJSON出力で安定文言を検証するテストがある。
- [x] `python3 01_Plans/tools/test_check_phase9_template_sync.py` が成功する。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時にorphan issueが0件である。

### 作業項目（Task breakdown）
- [x] 例外正規化ロジックを拡張する。
- [x] unit/CLI契約テストを追加する。
- [x] テストとplanning queueを実行する。

### 当時の検証計画（Validation plan）
- `python3 01_Plans/tools/test_check_phase9_template_sync.py`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
- `python3 01_Plans/tools/test_check_phase9_template_sync.py`
  - Ran 25 tests in 0.736s
  - OK
- `python3 01_Plans/tools/planning_queue.py`
  - issue_orphan: 0
