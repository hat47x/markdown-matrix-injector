# Issue: Phase 9 template sync quality gate hardening

## Meta
- Type: Docs
- Status: Done
- Priority: High
- Scope: `01_Plans/tools/`, `03_Implement/test/`, `04_Documentation/`
- Expected verification level: docs-check + unit

## Traceability
- Related Backlog/Phase: Phase 9 Rule Table Interoperability & Design Assetization
- Related ADR/Spec: `01_Plans/adr/ADR-0008-phase9-template-sync-quality-gate-hardening.md`

## Execution Plan
### Proposed solution (解決策の概要)
- `check_phase9_template_sync.py` を拡張し、ヘッダ一致に加えて必須列非空・RuleId重複・日付形式を検査する。
- `markdownMatrixPlugin.test.ts` に 4 ベンチマーク表を対象とした観測 contract test を追加し、`columns/grep/header` の回帰を固定化する。
- Phase 9 運用ガイドへ「品質監査付き同期」の手順と失敗時の一次対応を追記する。

### Acceptance criteria (受入条件)
- [x] `01_Plans/tools/check_phase9_template_sync.py` がヘッダ一致に加え、必須列非空・RuleId一意性・日付形式を検証できる。
- [x] `01_Plans/tools/test_check_phase9_template_sync.py` に上記監査項目の正常系/異常系テストが追加される。
- [x] `03_Implement/test/markdownMatrixPlugin.test.ts` にベンチマーク4表を対象とした観測テストが追加される。
- [x] `04_Documentation/phase9-rule-table-template-operations.md` に品質監査付き同期フローと失敗時対応が追記される。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時に orphan issue が 0 件である。

### Task breakdown (作業分解)
- [x] 同期監査スクリプトを拡張する。
- [x] 同期監査スクリプトの単体テストを拡張する。
- [x] ベンチマーク4表の観測 contract test を追加する。
- [x] Phase 9 運用ガイドへ監査付き同期フローを追記する。
- [x] planning queue を再実行し整合性を確認する。

### Validation plan (検証計画)
- `python3 01_Plans/tools/test_check_phase9_template_sync.py`
- `python3 01_Plans/tools/check_phase9_template_sync.py`
- `cd 03_Implement && npm test`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
- 2026-04-04: `python3 01_Plans/tools/test_check_phase9_template_sync.py`（7 tests, all passed）
- 2026-04-04: `python3 01_Plans/tools/check_phase9_template_sync.py`（`phase9 template sync: OK`）
- 2026-04-04: `cd 03_Implement && npm test`（142 tests, all passed）
- 2026-04-04: `python3 01_Plans/tools/planning_queue.py`（`issue_pending: 0`, `issue_orphan: 0`）
