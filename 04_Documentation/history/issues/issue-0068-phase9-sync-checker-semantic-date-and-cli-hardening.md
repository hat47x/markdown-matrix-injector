# Issue: Phase 9の同期検査で実在日付・有効期間とCSV指定を確認する

この文書は、Phase 9当時の同期検査における日付の妥当性と検査対象指定の強化について、完了判断を残したIssue記録です。2026年4月5日の検証結果は当時の実行証跡であり、現在の入力データや実装を新たに確認したものではありません。

## Meta
- Type: Docs
- Status: Done
- Priority: High
- Scope: `03_Implement/tools/`, `04_Documentation/`, `04_Documentation/history/issues/`
- Expected verification level: docs-check + unit

## Traceability
- Related Backlog/Phase: Phase 9 Rule Table Interoperability & Design Assetization
- Related ADR/Spec: `01_Plans/adr/ADR-0008-phase9-template-sync-quality-gate-hardening.md`

## 当時の実行計画
### 解決方針（当時の提案）
- 同期検査（sync checker）の日付確認を、正規表現による形式の一致だけで済ませず、実在する日付かどうかも検証する。あわせて、有効期間の開始日が終了日より後にならないこと（`EffectiveFrom <= ExpiresAt`）を確認する。
- 同期検査に`--docs`と`--fixture`の指定を追加し、ローカルで検証する際に対象のCSVファイルを選べるようにする。
- 単体テストに、CLI引数の扱いと日付検証の異常系（存在しない日付や有効期間の逆転）を加える。

### 受入条件（Acceptance criteria）
- [x] `check_phase9_template_sync.py` が `2026-13-01` 等の不正日付を検知する。
- [x] `check_phase9_template_sync.py` が `EffectiveFrom > ExpiresAt` を検知する。
- [x] `check_phase9_template_sync.py` が `--docs` / `--fixture` を受け取り、対象CSVを切り替えられる。
- [x] `test_check_phase9_template_sync.py` に上記異常系のテストが追加される。
- [x] `04_Documentation/phase9-rule-table-template-operations.md` に監査観点として有効期間整合が追記される。
- [x] `python3 03_Implement/tools/planning_queue.py` 実行時にorphan issueが0件である。

### 作業項目（Task breakdown）
- [x] sync checkerの日付検証をsemantic化する。
- [x] 有効期間整合チェックを追加する。
- [x] CLI引数（--docs / --fixture）を追加する。
- [x] unit testと運用ガイドを更新する。
- [x] planning queueで整合性を確認する。

### 当時の検証計画（Validation plan）
- `python3 03_Implement/tools/test_check_phase9_template_sync.py`
- `python3 03_Implement/tools/check_phase9_template_sync.py`
- `python3 03_Implement/tools/check_phase9_template_sync.py --docs 04_Documentation/samples/phase9-rule-table-benchmark-pack.csv --fixture 03_Implement/test/fixtures/workspace/data/phase9-rule-table-benchmark-pack.csv`
- `python3 03_Implement/tools/planning_queue.py`

## Validation evidence (実行証跡)
- 2026-04-05: `python3 03_Implement/tools/test_check_phase9_template_sync.py`（9 tests, all passed）
- 2026-04-05: `python3 03_Implement/tools/check_phase9_template_sync.py`（`phase9 template sync: OK`）
- 2026-04-05: `python3 03_Implement/tools/check_phase9_template_sync.py --docs 04_Documentation/samples/phase9-rule-table-benchmark-pack.csv --fixture 03_Implement/test/fixtures/workspace/data/phase9-rule-table-benchmark-pack.csv`（`phase9 template sync: OK`）
- 2026-04-05: `python3 03_Implement/tools/planning_queue.py`（`issue_pending: 0`, `issue_orphan: 0`）
