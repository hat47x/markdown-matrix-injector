# Issue: Query Evidence artifact helper の Windows path source metadata テスト

## Meta
- Type: Test
- Status: Done
- Priority: Medium
- Scope: `03_Implement/test/queryEvidence.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 6 Documentation feedback loop
- Related ADR/Spec: `01_Plans/issues/issue-0040-query-evidence-windows-path-basename.md`

## Execution Plan
### Proposed solution (解決策の概要)
- `buildQueryEvidenceExportArtifacts` にWindows形式パスを渡した場合、`markdownReportText` の `Source` 行がbasename（`spec`）になることをテストで固定する。
- 実装コード変更は不要で、既存動作の回帰防止を目的にテストを追加する。

### Acceptance criteria (受入条件)
- [x] Windows形式パス入力でartifactのsource metadataがbasenameに正規化されるテストがある。
- [x] `npm test` が通過する。

### Task breakdown (作業分解)
- [x] unit testを追加する。
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
  - Windows形式パス入力で `buildQueryEvidenceExportArtifacts` の `markdownReportText` が `- Source: spec` を含むことを検証するテストを追加。
  - unit/integrationを含む全121テストが通過。
  - planning queueはpending/orphanともに0件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
