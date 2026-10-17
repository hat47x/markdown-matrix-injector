# Issue: Phase 9のテンプレート同期検査をnpm testの実行手順に組み込む

この文書は、Phase 9当時のテンプレート同期検査を通常のテスト実行手順に組み込む方針と完了判断を残したIssue記録です。2026年4月5日の検証証跡は当時のものであり、現在の`npm test`や同期検査を新たに実行した記録ではありません。

## Meta
- Type: Docs
- Status: Done
- Priority: High
- Scope: `03_Implement/`, `01_Plans/tools/`, `01_Plans/issues/`
- Expected verification level: docs-check + unit

## Traceability
- Related Backlog/Phase: Phase 9 Rule Table Interoperability & Design Assetization
- Related ADR/Spec: `01_Plans/adr/ADR-0008-phase9-template-sync-quality-gate-hardening.md`

## 当時の実行計画
### 解決方針（当時の提案）
- Phase 9の同期検査（sync checker）を`npm test`の実行手順に組み込み、通常の回帰テストでも品質ゲートによる確認を必ず行うようにする。
- 同期検査のテストに、CLI引数を使った正常時・異常時のケースを加える。終了コード（exit code）と表示メッセージが想定した結果になることを確認する。

### 受入条件（Acceptance criteria）
- [x] `03_Implement/package.json` のtestフローがunit test + phase9 sync checkerを実行する。
- [x] `test_check_phase9_template_sync.py` にCLI引数経由のテストが追加される。
- [x] `cd 03_Implement && npm test` でphase9 sync checkerが実行される。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時にorphan issueが0件である。

### 作業項目（Task breakdown）
- [x] npm scriptを更新する。
- [x] CLI経由の単体テストを追加する。
- [x] npm testとplanning queueを再実行する。

### 当時の検証計画（Validation plan）
- `python3 01_Plans/tools/test_check_phase9_template_sync.py`
- `cd 03_Implement && npm test`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
- 2026-04-05: `python3 01_Plans/tools/test_check_phase9_template_sync.py`（11 tests, all passed）
- 2026-04-05: `cd 03_Implement && npm test`（`test:unit` 後に `test:phase9-sync` が実行され、sync checker `OK`）
- 2026-04-05: `python3 01_Plans/tools/planning_queue.py`（`issue_pending: 0`, `issue_orphan: 0`）
