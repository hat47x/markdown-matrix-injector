# Issue: Query Evidence Markdown レポートに source metadata を追加

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/dx/vscodeAdapters.ts`, `03_Implement/test/queryEvidence.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 6 Documentation feedback loop
- Related ADR/Spec: `01_Plans/issues/issue-0033-query-evidence-export-artifacts-helper.md`

## Execution Plan
### Proposed solution (解決策の概要)
- Markdownレポートへ `Source` 行を追加し、どのMarkdownから抽出したevidenceかを明示する。
- `buildQueryEvidenceMarkdown` をoptions対応（`sourceName`）に拡張し、既存呼び出し互換を維持する。
- `buildQueryEvidenceExportArtifacts` からsource basenameを渡し、生成される `.md` 出力にmetadataを含める。

### Acceptance criteria (受入条件)
- [x] Markdownレポートにsource metadataを出力できる。
- [x] options未指定時の既存出力互換が維持される。
- [x] `npm test` が通過する。

### Task breakdown (作業分解)
- [x] `buildQueryEvidenceMarkdown` をoptions対応へ更新する。
- [x] artifact builderからsourceNameを渡す。
- [x] unit testを更新/追加する。
- [x] `npm test` を実行する。

### Validation plan (検証計画)
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
