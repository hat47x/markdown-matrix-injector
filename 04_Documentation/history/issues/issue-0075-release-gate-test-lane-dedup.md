# Issue: リリース判定の単体テストとPhase 9同期検査の重複をなくす

この文書は当時の完了判断を残したIssue記録です。検証証跡は当時の結果であり、現在の実装やCIを再検証したものではありません。

## Meta
- Type: Docs
- Status: Done
- Priority: Medium
- Scope: `03_Implement/tools/`, `04_Documentation/history/issues/`
- Expected verification level: docs-check + unit

## Traceability
- Related Backlog/Phase: Phase 9 Rule Table Interoperability & Design Assetization
- Related ADR/Spec: `01_Plans/adr/ADR-0008-phase9-template-sync-quality-gate-hardening.md`

## 当時の実行計画
### 解決方針（当時の提案）
- リリース判定のG2では`npm test`ではなく`npm run test:unit`を実行し、G3（Phase9Sync）の同期検査と役割を分ける。
- 同じ同期検査（sync checker）が重複して実行されることを避け、ゲートが失敗した際に原因を特定しやすくする。

### 受入条件（Acceptance criteria）
- [x] `release_gate_check.py` のG2が `npm run test:unit` を実行する。
- [x] `test_release_gate_check.py` の期待メッセージが更新される。
- [x] `python3 03_Implement/tools/test_release_gate_check.py` が成功する。
- [x] `python3 03_Implement/tools/planning_queue.py` 実行時にorphan issueが0件である。

### 作業項目（Task breakdown）
- [x] G2実行コマンドを更新する。
- [x] unit testを更新する。
- [x] planning queueを再実行する。

### 当時の検証計画（Validation plan）
- `python3 03_Implement/tools/test_release_gate_check.py`
- `python3 03_Implement/tools/planning_queue.py`

## Validation evidence (実行証跡)
- 2026-04-06: `python3 03_Implement/tools/test_release_gate_check.py`（19 tests, all passed）
- 2026-04-06: `python3 03_Implement/tools/planning_queue.py`（`issue_pending: 0`, `issue_orphan: 0`）
