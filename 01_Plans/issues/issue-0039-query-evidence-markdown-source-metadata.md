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
- Markdown レポートへ `Source` 行を追加し、どの Markdown から抽出した evidence かを明示する。
- `buildQueryEvidenceMarkdown` を options 対応（`sourceName`）に拡張し、既存呼び出し互換を維持する。
- `buildQueryEvidenceExportArtifacts` から source basename を渡し、生成される `.md` 出力に metadata を含める。

### Acceptance criteria (受入条件)
- [x] Markdown レポートに source metadata を出力できる。
- [x] options 未指定時の既存出力互換が維持される。
- [x] `npm test` が通過する。

### Task breakdown (作業分解)
- [x] `buildQueryEvidenceMarkdown` を options 対応へ更新する。
- [x] artifact builder から sourceName を渡す。
- [x] unit test を更新/追加する。
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
  - Markdown レポートに `- Source: <basename>` を追加できる options を実装。
  - artifact helper から source basename を渡し、出力 `.md` に metadata を反映。
  - 既存互換を維持しつつ unit test を追加し、全 119 テストが通過。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
