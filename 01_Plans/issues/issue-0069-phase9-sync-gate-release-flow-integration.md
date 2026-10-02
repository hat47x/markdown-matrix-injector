# Issue: Phase 9 sync gate release flow integration

## Meta
- Type: Docs
- Status: Done
- Priority: High
- Scope: `03_Implement/`, `01_Plans/tools/`, `01_Plans/issues/`
- Expected verification level: docs-check + unit

## Traceability
- Related Backlog/Phase: Phase 9 Rule Table Interoperability & Design Assetization
- Related ADR/Spec: `01_Plans/adr/ADR-0008-phase9-template-sync-quality-gate-hardening.md`

## Execution Plan
### Proposed solution (解決策の概要)
- Phase 9 sync checkerを `npm test` フローへ統合し、通常の回帰実行で必ず品質ゲートを通過させる。
- sync checkerテストにCLI引数経由の正常系/異常系を追加し、exit codeとメッセージを保証する。

### Acceptance criteria (受入条件)
- [x] `03_Implement/package.json` のtestフローがunit test + phase9 sync checkerを実行する。
- [x] `test_check_phase9_template_sync.py` にCLI引数経由のテストが追加される。
- [x] `cd 03_Implement && npm test` でphase9 sync checkerが実行される。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時にorphan issueが0件である。

### Task breakdown (作業分解)
- [x] npm scriptを更新する。
- [x] CLI経由の単体テストを追加する。
- [x] npm testとplanning queueを再実行する。

### Validation plan (検証計画)
- `python3 01_Plans/tools/test_check_phase9_template_sync.py`
- `cd 03_Implement && npm test`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
- 2026-04-05: `python3 01_Plans/tools/test_check_phase9_template_sync.py`（11 tests, all passed）
- 2026-04-05: `cd 03_Implement && npm test`（`test:unit` 後に `test:phase9-sync` が実行され、sync checker `OK`）
- 2026-04-05: `python3 01_Plans/tools/planning_queue.py`（`issue_pending: 0`, `issue_orphan: 0`）
