# Issue: Phase 6でクエリの証跡をCSVとJSONで同時に出力する

この文書は、当時のクエリ証跡JSON出力に関する提案と完了状態を残したIssue記録です。以下のチェック項目と2026年3月29日の検証結果は当時の内容であり、現在の実装や動作を新たに確認したものではありません。

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/extension.ts`, `03_Implement/src/dx/vscodeAdapters.ts`, `03_Implement/test/`
- Expected verification level: unit + manual-e2e

## Traceability
- Related Backlog/Phase: Phase 6 Documentation feedback loop
- Related ADR/Spec: `01_Plans/adr/ADR-0004-phase6-product-gap-implementation-sequencing.md`, `04_Documentation/history/issues/issue-0023-phase6-query-evidence-export-mvp.md`

## 当時の実行計画
### 解決方針（当時の提案）
- 開発・検証用の`__dev.exportQueryEvidence`を実行した際、CSVに加えてJSONも同時に出力する。監査時に人が確認する場合にも、プログラムで処理する場合にも再利用できる証跡を作る。

### 受入条件（Acceptance criteria）
- [x] `query-evidence.csv` と `query-evidence.json` の両方を出力できる。
- [x] JSONは `collectQueryEvidenceRecords` と同一順序の配列を保持する。
- [x] 既存テストを含む `npm test` が通過する。

### 作業項目（Task breakdown）
- [x] `vscodeAdapters` にJSON生成ヘルパーを追加する。
- [x] `extension.ts` のexportコマンドをCSV + JSON同時出力に変更する。
- [x] 単体テストを追加し、CSV/JSONの整合を確認する。

### 当時の検証計画（Validation plan）
- `cd 03_Implement && npm test`
- `python3 03_Implement/tools/planning_queue.py`

## Validation evidence (実行証跡)
### 2026-03-29 (UTC)
- Run date (UTC): `2026-03-29`
- Executor: `agent`
- Commands:
  - `cd 03_Implement && npm test`
  - `python3 03_Implement/tools/planning_queue.py`
- Result summary:
  - `__dev.exportQueryEvidence` でCSV / JSONの2形式を同時出力することを実装。
  - `buildQueryEvidenceJson` と `queryEvidence.test.ts` の追加により、順序安定・シリアライズ整合を確認。
  - `npm test` 全件通過、queue pending/orphanともに0を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
