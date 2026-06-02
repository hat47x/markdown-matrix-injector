# Issue: Query Evidence Markdown Export 追加（CSV/JSONに加えて可読版を出力）

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/extension.ts`, `03_Implement/src/dx/vscodeAdapters.ts`, `03_Implement/test/queryEvidence.test.ts`, `03_Implement/test/extensionIntegration.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 6 Documentation feedback loop
- Related ADR/Spec: `01_Plans/issues/issue-0025-phase6-query-evidence-export-hardening.md`

## Execution Plan
### Proposed solution (解決策の概要)
- `buildQueryEvidenceMarkdown` を追加し、埋め込み記法の抽出結果を Markdown テーブル形式で出力する。
- `__dev.exportQueryEvidence` 実行時に `query-evidence.md` も同時出力し、CSV/JSON/Markdown の3形式を揃える。
- 既存ユニットテストと integration source-assertion を更新し、出力ファイル追加による回帰を防止する。

### Acceptance criteria (受入条件)
- [x] `buildQueryEvidenceMarkdown(records)` が安定した Markdown テーブル文字列を返す。
- [x] `exportQueryEvidenceForEditor` が `query-evidence.md` を書き出す。
- [x] `npm test` が通過する。

### Task breakdown (作業分解)
- [x] `vscodeAdapters.ts` に Markdown 出力関数を追加する。
- [x] `extension.ts` で Markdown ファイル書き込みを追加する。
- [x] `queryEvidence.test.ts` と `extensionIntegration.test.ts` を更新する。
- [x] `npm test` で回帰確認する。

### Validation plan (検証計画)
- `cd 03_Implement && npm test`

## Validation evidence (実行証跡)
### 2026-03-29 (UTC)
- Run date (UTC): `2026-03-29`
- Executor: `agent`
- Commands:
  - `cd 03_Implement && npm test`
- Result summary:
  - `buildQueryEvidenceMarkdown` を追加し、Markdown テーブル出力をサポート。
  - `__dev.exportQueryEvidence` が `query-evidence.md` を CSV/JSON と同時出力するように更新。
  - unit/integration assertions を更新し、全 108 テストが通過。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
