# Issue: Phase 9の同期検査でファイル不在などのエラー原因を明示する

この文書は当時の完了判断を残したIssue記録です。2026年4月5日の検証結果は当時の証跡であり、現在の動作を再検証したものではありません。

## Meta
- Type: Docs
- Status: Done
- Priority: High
- Scope: `01_Plans/tools/`, `01_Plans/issues/`, `04_Documentation/`
- Expected verification level: docs-check + unit

## Traceability
- Related Backlog/Phase: Phase 9 Rule Table Interoperability & Design Assetization
- Related ADR/Spec: `01_Plans/adr/ADR-0008-phase9-template-sync-quality-gate-hardening.md`

## 当時の実行計画
### 解決方針（当時の提案）
- 同期検査（sync checker）でファイルが存在しない場合やCSVが空の場合などに、例外で停止する代わりに、`phase9 template sync: NG`と原因を表示できるようにする。
- 単体テストにCLIから存在しないファイルを指定する異常系を加え、運用時に原因を切り分けやすくする。

### 受入条件（Acceptance criteria）
- [x] `check_phase9_template_sync.py` がFileNotFoundError / ValueErrorを捕捉して `NG` を返す。
- [x] `test_check_phase9_template_sync.py` にmissing file異常系が追加される。
- [x] `04_Documentation/phase9-rule-table-template-operations.md` に「ファイル未存在」時の一次対応が追記される。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時にorphan issueが0件である。

### 作業項目（Task breakdown）
- [x] sync checkerの例外処理を追加する。
- [x] CLI異常系テストを追加する。
- [x] 運用ガイドを更新する。
- [x] planning queueを再実行する。

### 当時の検証計画（Validation plan）
- `python3 01_Plans/tools/test_check_phase9_template_sync.py`
- `python3 01_Plans/tools/check_phase9_template_sync.py --docs does-not-exist.csv --fixture does-not-exist.csv`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
- 2026-04-05: `python3 01_Plans/tools/test_check_phase9_template_sync.py`（12 tests, all passed）
- 2026-04-05: `python3 01_Plans/tools/check_phase9_template_sync.py --docs does-not-exist.csv --fixture does-not-exist.csv`（exit code 1, `phase9 template sync: NG` を確認）
- 2026-04-05: `python3 01_Plans/tools/planning_queue.py`（`issue_pending: 0`, `issue_orphan: 0`）
