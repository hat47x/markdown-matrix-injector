# Issue: クエリ証跡をCSV・JSONに加えてMarkdownでも出力する

この文書は、当時のクエリ証跡Markdown出力に関する提案と完了状態を残したIssue記録です。受入条件・検証計画と2026年3月29日の実行証跡は当時の内容であり、現行の実装やテスト結果を新たに確認したものではありません。

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/extension.ts`, `03_Implement/src/dx/vscodeAdapters.ts`, `03_Implement/test/queryEvidence.test.ts`, `03_Implement/test/extensionIntegration.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 6 Documentation feedback loop
- Related ADR/Spec: `01_Plans/issues/issue-0025-phase6-query-evidence-export-hardening.md`

## 当時の実行計画
### 解決方針（当時の提案）
- `buildQueryEvidenceMarkdown`を追加し、埋め込み記法から取り出したクエリの情報を、Markdownの表として出力できるようにする。
- `__dev.exportQueryEvidence`を実行したとき、既存のCSV・JSONに加えて`query-evidence.md`も出力する。これにより、3つの形式の証跡をまとめて得られるようにする。
- 既存の単体テストと統合テストのソース検証（integration source-assertion）を更新し、出力ファイルの追加によって従来の動作が変わらないことを確認できるようにする。

### 受入条件（Acceptance criteria）
- [x] `buildQueryEvidenceMarkdown(records)` が安定したMarkdownテーブル文字列を返す。
- [x] `exportQueryEvidenceForEditor` が `query-evidence.md` を書き出す。
- [x] `npm test` が通過する。

### 作業項目（Task breakdown）
- [x] `vscodeAdapters.ts` にMarkdown出力関数を追加する。
- [x] `extension.ts` でMarkdownファイル書き込みを追加する。
- [x] `queryEvidence.test.ts` と `extensionIntegration.test.ts` を更新する。
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
  - `buildQueryEvidenceMarkdown` を追加し、Markdownテーブル出力をサポート。
  - `__dev.exportQueryEvidence` が `query-evidence.md` をCSV/JSONと同時出力するように更新。
  - unit/integration assertionsを更新し、全108テストが通過。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
