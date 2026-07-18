# Issue: Phase 9 QueryExample contract expansion

## Meta
- Type: Docs
- Status: Done
- Priority: High
- Scope: `03_Implement/test/`, `01_Plans/issues/`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 9 Rule Table Interoperability & Design Assetization
- Related ADR/Spec: `01_Plans/adr/ADR-0008-phase9-template-sync-quality-gate-hardening.md`

## Execution Plan
### Proposed solution (解決策の概要)
- benchmark pack の `QueryExample` 列をテスト入力として再利用し、行単位で契約テストを拡張する。
- table別の固定ケースに加え、テンプレート行が増えても追従しやすい pattern test を追加する。

### Acceptance criteria (受入条件)
- [x] `markdownMatrixPlugin.test.ts` に `QueryExample` 列起点の contract test が追加される。
- [x] 新規 contract test が `cd 03_Implement && npm test` で成功する。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時に orphan issue が 0 件である。

### Task breakdown (作業分解)
- [x] QueryExample contract test を追加する。
- [x] npm test と planning queue を実行する。

### Validation plan (検証計画)
- `cd 03_Implement && npm test`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
- 2026-04-06: `cd 03_Implement && npm test`（`test:unit` + `test:phase9-sync` ともに成功）
- 2026-04-06: `python3 01_Plans/tools/planning_queue.py`（`issue_pending: 0`, `issue_orphan: 0`）
