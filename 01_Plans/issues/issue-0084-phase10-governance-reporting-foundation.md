# Issue: Phase 10 governance reporting foundation

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: `01_Plans/tools/`, `01_Plans/issues/`, `04_Documentation/`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 10 Adoption Operations Governance Automation
- Related ADR/Spec: `01_Plans/adr/ADR-0009-phase10-adoption-operations-governance-automation.md`

## Execution Plan
### Proposed solution (解決策の概要)
- 週次ガバナンスレポート生成の初期基盤として、KPI入力JSONスキーマとMarkdownレポート雛形を定義する。
- docs/support改善タスクで共通利用するSLAメタデータ（triage/workaround/fix期限）を最小構成で契約化する。
- 後続Issueが再利用できるよう、サンプル入力と最小検証テストを追加する。

### Acceptance criteria (受入条件)
- [x] KPI入力データの契約（必須キー・型・意味）がリポジトリ内文書として定義されている。
- [x] 週次レポートのMarkdown雛形（KPI要約、SLA警告、次アクション）が作成されている。
- [x] SLAメタデータ項目（triage/workaround/fix deadline）が仕様化されている。
- [x] サンプル入力データから雛形へ流し込む最小CLIまたはスクリプトが追加される。
- [x] 最小テストで「必須キー不足時に失敗」「正常入力でレポート生成成功」を確認できる。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時に orphan issue が 0 件である。

### Task breakdown (作業分解)
- [x] KPI/SLA入力契約の仕様ドラフトを作成する。
- [x] 週次レポート雛形を作成する。
- [x] 雛形生成の最小スクリプトを実装する。
- [x] 単体テストを追加し、検証コマンドを通す。

### Validation plan (検証計画)
- `python3 -m unittest 01_Plans.tools.test_phase10_governance_report`
- `python3 01_Plans/tools/planning_queue.py`
