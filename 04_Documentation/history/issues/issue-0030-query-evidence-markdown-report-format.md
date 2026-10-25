# Issue: クエリ証跡のMarkdown出力を監査向けレポートに整える

この文書は、当時のMarkdownレポート形式の改善提案と完了状態を残したIssue記録です。整形関数が0件時に説明を返すことと、出力コマンドが0件時にファイル生成を止めることは区別してください。検証計画・実行証跡は当時の記録であり、現行動作を新たに確認したものではありません。

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/dx/vscodeAdapters.ts`, `03_Implement/test/queryEvidence.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 6 Documentation feedback loop
- Related ADR/Spec: `04_Documentation/history/issues/issue-0028-phase6-query-evidence-markdown-export.md`

## 当時の実行計画
### 解決方針（当時の提案）
- `buildQueryEvidenceMarkdown`の出力を、表だけの文字列から、見出し・件数・表を備えたレポート形式へ拡張する。監査ログへ貼り付けた際にも内容を理解しやすくする。
- `records`が0件のときにも`_No evidence records found._`を返すようにし、整形関数だけを利用する場合にも結果を読み取れるようにする。
- 既存の単体テストを更新し、新しい出力形式と0件の場合の結果を確認できるようにする。

### 受入条件（Acceptance criteria）
- [x] Markdown出力が見出し・件数・テーブルを含む。
- [x] recordsが0件のとき、説明文を返す。
- [x] `npm test` が通過する。

### 作業項目（Task breakdown）
- [x] `vscodeAdapters.ts` のMarkdown formatterを更新する。
- [x] `queryEvidence.test.ts` の期待値を更新する。
- [x] `npm test` で回帰確認する。

### 当時の検証計画（Validation plan）
- `cd 03_Implement && npm test`

## Validation evidence (実行証跡)
### 2026-03-29 (UTC)
- Run date (UTC): `2026-03-29`
- Executor: `agent`
- Commands:
  - `cd 03_Implement && npm test`
- Result summary:
  - Markdown exportを監査向けレポート形式（見出し + 件数 + テーブル）へ更新。
  - records=0のempty-stateレポートを追加。
  - query evidenceテストを更新し、全110テストが通過。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
