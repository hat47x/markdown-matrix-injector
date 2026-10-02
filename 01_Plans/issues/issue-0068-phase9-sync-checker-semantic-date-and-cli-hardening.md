# Issue: Phase 9 sync checker semantic date and CLI hardening

## Meta
- Type: Docs
- Status: Done
- Priority: High
- Scope: `01_Plans/tools/`, `04_Documentation/`, `01_Plans/issues/`
- Expected verification level: docs-check + unit

## Traceability
- Related Backlog/Phase: Phase 9 Rule Table Interoperability & Design Assetization
- Related ADR/Spec: `01_Plans/adr/ADR-0008-phase9-template-sync-quality-gate-hardening.md`

## Execution Plan
### Proposed solution (解決策の概要)
- sync checkerの日付検証を正規表現一致から「実在日付 + 有効期間整合（EffectiveFrom <= ExpiresAt）」へ強化する。
- sync checkerに `--docs` / `--fixture` を追加し、ローカル検証時に任意CSVを対象化できるようにする。
- unit testにCLI/検証ロジックの異常系（不正日付・期間逆転）を追加する。

### Acceptance criteria (受入条件)
- [x] `check_phase9_template_sync.py` が `2026-13-01` 等の不正日付を検知する。
- [x] `check_phase9_template_sync.py` が `EffectiveFrom > ExpiresAt` を検知する。
- [x] `check_phase9_template_sync.py` が `--docs` / `--fixture` を受け取り、対象CSVを切り替えられる。
- [x] `test_check_phase9_template_sync.py` に上記異常系のテストが追加される。
- [x] `04_Documentation/phase9-rule-table-template-operations.md` に監査観点として有効期間整合が追記される。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時にorphan issueが0件である。

### Task breakdown (作業分解)
- [x] sync checkerの日付検証をsemantic化する。
- [x] 有効期間整合チェックを追加する。
- [x] CLI引数（--docs / --fixture）を追加する。
- [x] unit testと運用ガイドを更新する。
- [x] planning queueで整合性を確認する。

### Validation plan (検証計画)
- `python3 01_Plans/tools/test_check_phase9_template_sync.py`
- `python3 01_Plans/tools/check_phase9_template_sync.py`
- `python3 01_Plans/tools/check_phase9_template_sync.py --docs 04_Documentation/samples/phase9-rule-table-benchmark-pack.csv --fixture 03_Implement/test/fixtures/workspace/data/phase9-rule-table-benchmark-pack.csv`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
- 2026-04-05: `python3 01_Plans/tools/test_check_phase9_template_sync.py`（9 tests, all passed）
- 2026-04-05: `python3 01_Plans/tools/check_phase9_template_sync.py`（`phase9 template sync: OK`）
- 2026-04-05: `python3 01_Plans/tools/check_phase9_template_sync.py --docs 04_Documentation/samples/phase9-rule-table-benchmark-pack.csv --fixture 03_Implement/test/fixtures/workspace/data/phase9-rule-table-benchmark-pack.csv`（`phase9 template sync: OK`）
- 2026-04-05: `python3 01_Plans/tools/planning_queue.py`（`issue_pending: 0`, `issue_orphan: 0`）
