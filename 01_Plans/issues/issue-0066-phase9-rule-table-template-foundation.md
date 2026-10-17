# Issue: Phase 9のルール表テンプレートと検証用データの基盤を整える

この文書は、Phase 9当時のルール表テンプレート整備と完了判断を残したIssue記録です。並列実行メモと検証証跡は原文どおり保持します。証跡には実行日が明記されていないため、現行の動作を新たに確認した記録として扱いません。

## Meta
- Type: Docs
- Status: Done
- Priority: High
- Scope: `04_Documentation/`, `03_Implement/test/fixtures/`, `01_Plans/issues/`
- Expected verification level: docs-check + unit

## Traceability
- Related Backlog/Phase: Phase 9 Rule Table Interoperability & Design Assetization
- Related ADR/Spec: `01_Plans/adr/ADR-0007-phase9-rule-table-interoperability-and-design-assetization.md`

## 当時の実行計画
### 解決方針（当時の提案）
- Phase 9の初回作業として、Droolsを参考にした表のパターンを再利用可能なテンプレート群として整備する。文書サンプルとテスト用データ（test fixture）を双方向に同期する規則も定義する。
- SIerの設計文書でよく使われる4種類の表（要件トレース、状態遷移、障害切り分け、リリース判定）を、最小構成のベンチマークとして定める。

### 受入条件（Acceptance criteria）
- [x] `04_Documentation/` にPhase 9テンプレート運用ガイド（作成ルール・更新ルール・同期ルール）が追加される。
- [x] docsサンプルとtest fixtureで同一列定義を共有するベンチマークCSV/XLSXセットが追加される。
- [x] `03_Implement/test` にベンチマーク表を使った観測テスト（columns/grep/headerなど）が追加または更新される。
- [x] template quality gate（可読性・検証性・追跡性）の判定手順が明文化される。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時にorphan issueが0件である。

### 作業項目（Task breakdown）
- [x] Phase 9テンプレート運用ガイドを作成する。
- [x] benchmark template data（docs/test fixture）を追加する。
- [x] query観測テストを追加/更新する。
- [x] planning queueを再実行し整合性を確認する。

## Parallelization memo (並列実行メモ)
- `開発を進めて` の自律フロー（Close不可時は並列実行用プロンプト作成）に従い、`01_Plans/issues/parallel-prompts-issue-0066.md` を実行入口として使用する。

### 当時の検証計画（Validation plan）
- `cd 03_Implement && npm test`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
- `python3 01_Plans/tools/check_phase9_template_sync.py` -> `phase9 template sync: OK`
- `python3 01_Plans/tools/test_check_phase9_template_sync.py`
- `python3 04_Documentation/samples/generate_phase9_rule_table_benchmark_xlsx.py --help`
- `cd 03_Implement && npm test`
- `python3 01_Plans/tools/planning_queue.py` -> `issue_orphan: 0`, `issue_pending: 0`
