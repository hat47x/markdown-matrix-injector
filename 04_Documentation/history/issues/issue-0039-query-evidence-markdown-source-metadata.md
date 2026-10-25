# Issue: クエリ証跡のMarkdownレポートに抽出元の文書名を記載する

この文書は、当時のMarkdown証跡レポートに抽出元の情報を追加する提案と完了状態を残したIssue記録です。既存の呼び出しとの互換性と2026年3月31日の検証結果は当時の記録であり、現在の動作を新たに確認したものではありません。

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/dx/vscodeAdapters.ts`, `03_Implement/test/queryEvidence.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 6 Documentation feedback loop
- Related ADR/Spec: `04_Documentation/history/issues/issue-0033-query-evidence-export-artifacts-helper.md`

## 当時の実行計画
### 解決方針（当時の提案）
- Markdownレポートに`Source`行を追加し、証跡（evidence）をどのMarkdown文書から抽出したか分かるようにする。
- `buildQueryEvidenceMarkdown`でオプション（`sourceName`）を受け取れるようにし、オプションを指定しない従来の呼び出しもそのまま使えるようにする。
- `buildQueryEvidenceExportArtifacts`から抽出元の文書名（source basename）を渡し、生成される`.md`ファイルにその情報（metadata）を含める。

### 受入条件（Acceptance criteria）
- [x] Markdownレポートにsource metadataを出力できる。
- [x] options未指定時の既存出力互換が維持される。
- [x] `npm test` が通過する。

### 作業項目（Task breakdown）
- [x] `buildQueryEvidenceMarkdown` をoptions対応へ更新する。
- [x] artifact builderからsourceNameを渡す。
- [x] unit testを更新/追加する。
- [x] `npm test` を実行する。

### 当時の検証計画（Validation plan）
- `cd 03_Implement && npm test`

## Validation evidence (実行証跡)
### 2026-03-31 (UTC)
- Run date (UTC): `2026-03-31`
- Executor: `agent`
- Commands:
  - `cd 03_Implement && npm test`
- Result summary:
  - Markdownレポートに `- Source: <basename>` を追加できるoptionsを実装。
  - artifact helperからsource basenameを渡し、出力 `.md` にmetadataを反映。
  - 既存互換を維持しつつunit testを追加し、全119テストが通過。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
