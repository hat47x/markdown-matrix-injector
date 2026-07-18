# Issue: Phase 6 Query Evidence JSON Export（監査エビデンスのJSON併記）

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/extension.ts`, `03_Implement/src/dx/vscodeAdapters.ts`, `03_Implement/test/`
- Expected verification level: unit + manual-e2e

## Traceability
- Related Backlog/Phase: Phase 6 Documentation feedback loop
- Related ADR/Spec: `01_Plans/adr/ADR-0004-phase6-product-gap-implementation-sequencing.md`, `01_Plans/issues/issue-0023-phase6-query-evidence-export-mvp.md`

## Execution Plan
### Proposed solution (解決策の概要)
- 開発/検証用 `__dev.exportQueryEvidence` 実行時に CSV に加えて JSON も同時出力し、監査レビューと機械処理双方で再利用可能な証跡を生成する。

### Acceptance criteria (受入条件)
- [x] `query-evidence.csv` と `query-evidence.json` の両方を出力できる。
- [x] JSONは `collectQueryEvidenceRecords` と同一順序の配列を保持する。
- [x] 既存テストを含む `npm test` が通過する。

### Task breakdown (作業分解)
- [x] `vscodeAdapters` に JSON 生成ヘルパーを追加する。
- [x] `extension.ts` の export コマンドを CSV + JSON 同時出力に変更する。
- [x] 単体テストを追加し、CSV/JSONの整合を確認する。

### Validation plan (検証計画)
- `cd 03_Implement && npm test`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
### 2026-03-29 (UTC)
- Run date (UTC): `2026-03-29`
- Executor: `agent`
- Commands:
  - `cd 03_Implement && npm test`
  - `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - `__dev.exportQueryEvidence` で CSV / JSON の2形式を同時出力することを実装。
  - `buildQueryEvidenceJson` と `queryEvidence.test.ts` の追加により、順序安定・シリアライズ整合を確認。
  - `npm test` 全件通過、queue pending/orphan ともに 0 を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
