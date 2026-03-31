# Issue: Query Evidence Export 生成物を helper で一括構築する

## Meta
- Type: Refactor
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/dx/vscodeAdapters.ts`, `03_Implement/src/extension.ts`, `03_Implement/test/queryEvidence.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 6 Documentation feedback loop
- Related ADR/Spec: `01_Plans/issues/issue-0032-query-evidence-output-path-helper.md`

## Execution Plan
### Proposed solution (解決策の概要)
- `buildQueryEvidenceExportArtifacts(markdownText, markdownFilePath)` helper を追加し、records/csv/json/markdown/paths を一括生成する。
- `extension.ts` では helper の戻り値を使って export 処理を行い、フォーマット生成ロジックの分散を防ぐ。
- `queryEvidence.test.ts` に helper の一括生成結果を検証するテストを追加する。

### Acceptance criteria (受入条件)
- [x] export 生成物が helper から一括取得できる。
- [x] extension 側の export 処理が helper 利用へ更新される。
- [x] `npm test` が通過する。

### Task breakdown (作業分解)
- [x] helper を実装する。
- [x] extension の export 実装を helper 利用へ更新する。
- [x] unit test を追加する。
- [x] `npm test` を実行する。

### Validation plan (検証計画)
- `cd 03_Implement && npm test`

## Validation evidence (実行証跡)
### 2026-03-29 (UTC)
- Run date (UTC): `2026-03-29`
- Executor: `agent`
- Commands:
  - `cd 03_Implement && npm test`
- Result summary:
  - `buildQueryEvidenceExportArtifacts` を追加し、records/csv/json/markdown/paths を一括生成。
  - extension 側 export 処理を helper 利用へ更新。
  - helper の unit test を追加し、全 112 テストが通過。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
