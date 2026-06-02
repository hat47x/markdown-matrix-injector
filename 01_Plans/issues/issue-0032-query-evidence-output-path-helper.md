# Issue: Query Evidence 出力ファイル名生成を helper 化してテスト可能にする

## Meta
- Type: Refactor
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/dx/vscodeAdapters.ts`, `03_Implement/src/extension.ts`, `03_Implement/test/queryEvidence.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 6 Documentation feedback loop
- Related ADR/Spec: `01_Plans/issues/issue-0031-query-evidence-filename-scoping.md`

## Execution Plan
### Proposed solution (解決策の概要)
- `buildQueryEvidenceOutputPaths(markdownFilePath)` helper を `vscodeAdapters.ts` に追加し、CSV/JSON/MD のファイル名規則を集約する。
- `extension.ts` は helper を利用して出力パスを算出し、命名ロジックの重複を排除する。
- `queryEvidence.test.ts` に helper のユニットテストを追加し、basename のみが prefix へ反映されることを固定する。

### Acceptance criteria (受入条件)
- [x] 出力パス生成ロジックが helper に集約される。
- [x] helper のユニットテストが追加される。
- [x] `npm test` が通過する。

### Task breakdown (作業分解)
- [x] helper 実装を追加する。
- [x] extension 側で helper を利用する。
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
  - `buildQueryEvidenceOutputPaths(markdownFilePath)` を追加し、出力パス計算を helper 化。
  - `extension.ts` の出力パス計算を helper 経由へ統一。
  - helper のユニットテストを追加し、全 111 テストが通過。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
