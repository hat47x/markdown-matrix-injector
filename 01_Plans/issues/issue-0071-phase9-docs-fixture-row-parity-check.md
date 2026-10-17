# Issue: Phase 9の文書用CSVとテスト用CSVで行内容の一致を確認する

この文書は当時の完了判断を残したIssue記録です。2026年4月5日の検証結果は当時の証跡であり、現在のCSV内容を再確認したものではありません。

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
- 同期検査に文書用CSV（docs）とテスト用CSV（fixture）の行内容が一致するかを確認する処理（row parity）を追加し、ヘッダだけでは分からない差分を検知する。
- 単体テストに行内容が一致しない異常系を加え、同期ルールが差分を検知できることを確認する。

### 受入条件（Acceptance criteria）
- [x] `check_phase9_template_sync.py` がdocs/fixture行差分を検知する。
- [x] `test_check_phase9_template_sync.py` にrow parity異常系が追加される。
- [x] `04_Documentation/phase9-rule-table-template-operations.md` にrow parity観点が追記される。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時にorphan issueが0件である。

### 作業項目（Task breakdown）
- [x] row parity検証ロジックを追加する。
- [x] unit testを追加する。
- [x] 運用ガイドを更新する。
- [x] planning queueを再実行する。

### 当時の検証計画（Validation plan）
- `python3 01_Plans/tools/test_check_phase9_template_sync.py`
- `python3 01_Plans/tools/check_phase9_template_sync.py`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
- 2026-04-05: `python3 01_Plans/tools/test_check_phase9_template_sync.py`（13 tests, all passed）
- 2026-04-05: `python3 01_Plans/tools/check_phase9_template_sync.py`（`phase9 template sync: OK`）
- 2026-04-05: `python3 01_Plans/tools/planning_queue.py`（`issue_pending: 0`, `issue_orphan: 0`）
