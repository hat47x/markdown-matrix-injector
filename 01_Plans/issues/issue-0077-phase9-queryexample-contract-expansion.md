# Issue: Phase 9のQueryExampleを使った契約テストを行単位に拡充する

この文書は、Phase 9のベンチマーク表を使った契約テストの拡充方針と当時の完了判断を残したIssue記録です。2026年4月6日の実行証跡は当時の結果であり、現行のテストが成功することを新たに確認したものではありません。

## Meta
- Type: Docs
- Status: Done
- Priority: High
- Scope: `03_Implement/test/`, `01_Plans/issues/`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 9 Rule Table Interoperability & Design Assetization
- Related ADR/Spec: `01_Plans/adr/ADR-0008-phase9-template-sync-quality-gate-hardening.md`

## 当時の実行計画
### 解決方針（当時の提案）
- ベンチマーク表（benchmark pack）の`QueryExample`列をテスト入力として再利用し、各行を対象とする契約テストを拡充する。
- 表ごとの固定テストケースに加えて、テンプレートの行数が増えた場合にも対応しやすいパターンテスト（pattern test）を追加する。

### 受入条件（Acceptance criteria）
- [x] `markdownMatrixPlugin.test.ts` に `QueryExample` 列起点のcontract testが追加される。
- [x] 新規contract testが `cd 03_Implement && npm test` で成功する。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時にorphan issueが0件である。

### 作業項目（Task breakdown）
- [x] QueryExample contract testを追加する。
- [x] npm testとplanning queueを実行する。

### 当時の検証計画（Validation plan）
- `cd 03_Implement && npm test`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
- 2026-04-06: `cd 03_Implement && npm test`（`test:unit` + `test:phase9-sync` ともに成功）
- 2026-04-06: `python3 01_Plans/tools/planning_queue.py`（`issue_pending: 0`, `issue_orphan: 0`）
