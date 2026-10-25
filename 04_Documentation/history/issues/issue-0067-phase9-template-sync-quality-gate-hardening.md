# Issue: Phase 9のテンプレート同期に品質監査と回帰テストを加える

この文書は、Phase 9当時のテンプレート同期検査を強化した方針と完了判断を残したIssue記録です。2026年4月4日の検証結果は当時の実行証跡であり、現在のテストや同期状態を新たに確認したものではありません。

## Meta
- Type: Docs
- Status: Done
- Priority: High
- Scope: `03_Implement/tools/`, `03_Implement/test/`, `04_Documentation/`
- Expected verification level: docs-check + unit

## Traceability
- Related Backlog/Phase: Phase 9 Rule Table Interoperability & Design Assetization
- Related ADR/Spec: `01_Plans/adr/ADR-0008-phase9-template-sync-quality-gate-hardening.md`

## 当時の実行計画
### 解決方針（当時の提案）
- `check_phase9_template_sync.py`による同期検査で、列見出し（ヘッダ）の一致だけでなく、必須列が空でないこと、`RuleId`が重複しないこと、日付が所定の形式であることも確認できるようにする。
- `markdownMatrixPlugin.test.ts`に、4種類のベンチマーク表を使った観測用の契約テスト（contract test）を加える。`columns/grep/header`の動作が後の変更で損なわれないようにする。
- Phase 9運用ガイドに、品質監査を伴う同期の手順と、検査が失敗した場合の一次対応を記載する。

### 受入条件（Acceptance criteria）
- [x] `03_Implement/tools/check_phase9_template_sync.py` がヘッダ一致に加え、必須列非空・RuleId一意性・日付形式を検証できる。
- [x] `03_Implement/tools/test_check_phase9_template_sync.py` に上記監査項目の正常系/異常系テストが追加される。
- [x] `03_Implement/test/markdownMatrixPlugin.test.ts` にベンチマーク4表を対象とした観測テストが追加される。
- [x] `04_Documentation/phase9-rule-table-template-operations.md` に品質監査付き同期フローと失敗時対応が追記される。
- [x] `python3 03_Implement/tools/planning_queue.py` 実行時にorphan issueが0件である。

### 作業項目（Task breakdown）
- [x] 同期監査スクリプトを拡張する。
- [x] 同期監査スクリプトの単体テストを拡張する。
- [x] ベンチマーク4表の観測contract testを追加する。
- [x] Phase 9運用ガイドへ監査付き同期フローを追記する。
- [x] planning queueを再実行し整合性を確認する。

### 当時の検証計画（Validation plan）
- `python3 03_Implement/tools/test_check_phase9_template_sync.py`
- `python3 03_Implement/tools/check_phase9_template_sync.py`
- `cd 03_Implement && npm test`
- `python3 03_Implement/tools/planning_queue.py`

## Validation evidence (実行証跡)
- 2026-04-04: `python3 03_Implement/tools/test_check_phase9_template_sync.py`（7 tests, all passed）
- 2026-04-04: `python3 03_Implement/tools/check_phase9_template_sync.py`（`phase9 template sync: OK`）
- 2026-04-04: `cd 03_Implement && npm test`（142 tests, all passed）
- 2026-04-04: `python3 03_Implement/tools/planning_queue.py`（`issue_pending: 0`, `issue_orphan: 0`）
