# Issue: Query Evidence export 完了メッセージへ source 名を表示

## Meta
- Type: Feature
- Status: Done
- Priority: Low
- Scope: `03_Implement/src/dx/vscodeAdapters.ts`, `03_Implement/src/extension.ts`, `03_Implement/test/queryEvidence.test.ts`, `03_Implement/test/extensionIntegration.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 6 Documentation feedback loop
- Related ADR/Spec: `01_Plans/issues/issue-0039-query-evidence-markdown-source-metadata.md`

## Execution Plan
### Proposed solution (解決策の概要)
- `buildQueryEvidenceExportArtifacts` の戻り値に `sourceName` を含める。
- export完了メッセージを `for <sourceName>` 付きに更新し、複数文書を連続実行した際の識別性を高める。
- unit/integration assertionを更新して回帰を防止する。

### Acceptance criteria (受入条件)
- [x] export完了メッセージにsource名が含まれる。
- [x] artifact helperがsourceNameを返す。
- [x] `npm test` が通過する。

### Task breakdown (作業分解)
- [x] artifact helperの戻り値を拡張する。
- [x] extension完了メッセージを更新する。
- [x] unit/integration testを更新する。
- [x] `npm test` を実行する。

### Validation plan (検証計画)
- `cd 03_Implement && npm test`

## Validation evidence (実行証跡)
### 2026-03-31 (UTC)
- Run date (UTC): `2026-03-31`
- Executor: `agent`
- Commands:
  - `cd 03_Implement && npm test`
  - `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - artifact helper戻り値へ `sourceName` を追加。
  - export完了メッセージを `for ${sourceName}` 付きへ更新。
  - unit/integrationを更新し、全121テストが通過。
  - planning queueはpending/orphanともに0件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
