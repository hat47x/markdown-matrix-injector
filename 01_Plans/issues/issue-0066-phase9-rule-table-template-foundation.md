# Issue: Phase 9 rule table template foundation

## Meta
- Type: Docs
- Status: Done
- Priority: High
- Scope: `04_Documentation/`, `03_Implement/test/fixtures/`, `01_Plans/issues/`
- Expected verification level: docs-check + unit

## Traceability
- Related Backlog/Phase: Phase 9 Rule Table Interoperability & Design Assetization
- Related ADR/Spec: `01_Plans/adr/ADR-0007-phase9-rule-table-interoperability-and-design-assetization.md`

## Execution Plan
### Proposed solution (解決策の概要)
- Phase 9 の初回イテレーションとして、Drools参照パターンを再利用可能なテンプレート群へ昇格し、文書サンプルと test fixture の双方向同期ルールを定義する。
- SIer設計文書で頻出する4表（要件トレース、状態遷移、障害切り分け、リリース判定）を最小ベンチマークとして固定する。

### Acceptance criteria (受入条件)
- [x] `04_Documentation/` に Phase 9 テンプレート運用ガイド（作成ルール・更新ルール・同期ルール）が追加される。
- [x] docsサンプルと test fixture で同一列定義を共有するベンチマークCSV/XLSXセットが追加される。
- [x] `03_Implement/test` にベンチマーク表を使った観測テスト（columns/grep/header など）が追加または更新される。
- [x] template quality gate（可読性・検証性・追跡性）の判定手順が明文化される。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時に orphan issue が 0 件である。

### Task breakdown (作業分解)
- [x] Phase 9 テンプレート運用ガイドを作成する。
- [x] benchmark template data（docs/test fixture）を追加する。
- [x] query観測テストを追加/更新する。
- [x] planning queue を再実行し整合性を確認する。

## Parallelization memo (並列実行メモ)
- `開発を進めて` の自律フロー（Close不可時は並列実行用プロンプト作成）に従い、`01_Plans/issues/parallel-prompts-issue-0066.md` を実行入口として使用する。

### Validation plan (検証計画)
- `cd 03_Implement && npm test`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
- `python3 01_Plans/tools/check_phase9_template_sync.py` -> `phase9 template sync: OK`
- `python3 01_Plans/tools/test_check_phase9_template_sync.py`
- `python3 04_Documentation/samples/generate_phase9_rule_table_benchmark_xlsx.py --help`
- `cd 03_Implement && npm test`
- `python3 01_Plans/tools/planning_queue.py` -> `issue_orphan: 0`, `issue_pending: 0`
