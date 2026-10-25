# Issue: Phase 10の週次ガバナンスレポート生成基盤を整備する

この文書は、Phase 10の週次ガバナンスレポート生成について、当時の方針と完了判断を残したIssue記録です。原文には検証計画が記載されていますが、実行証跡の節はありません。現行の生成処理やテストを新たに確認したものではありません。

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: `03_Implement/tools/`, `04_Documentation/history/issues/`, `04_Documentation/`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 10 Adoption Operations Governance Automation
- Related ADR/Spec: `01_Plans/adr/ADR-0009-phase10-adoption-operations-governance-automation.md`

## 当時の実行計画
### 解決方針（当時の提案）
- 週次ガバナンスレポートを生成する初期基盤として、KPIの入力に用いるJSONスキーマと、Markdown形式のレポート雛形を定義する。
- 文書（docs）やサポート（support）の改善作業で共通して使うSLAメタデータについて、一次切り分け（triage）、回避策（workaround）、修正（fix）の期限を最小限の契約として定める。
- 後続のIssueでも再利用できるように、サンプル入力と基本的な検証テストを用意する。

### 受入条件（Acceptance criteria）
- [x] KPI入力データの契約（必須キー・型・意味）がリポジトリ内文書として定義されている。
- [x] 週次レポートのMarkdown雛形（KPI要約、SLA警告、次アクション）が作成されている。
- [x] SLAメタデータ項目（triage/workaround/fix deadline）が仕様化されている。
- [x] サンプル入力データから雛形へ流し込む最小CLIまたはスクリプトが追加される。
- [x] 最小テストで「必須キー不足時に失敗」「正常入力でレポート生成成功」を確認できる。
- [x] `python3 03_Implement/tools/planning_queue.py` 実行時にorphan issueが0件である。

### 作業項目（Task breakdown）
- [x] KPI/SLA入力契約の仕様ドラフトを作成する。
- [x] 週次レポート雛形を作成する。
- [x] 雛形生成の最小スクリプトを実装する。
- [x] 単体テストを追加し、検証コマンドを通す。

### 当時の検証計画（Validation plan）
- `python3 -m unittest 01_Plans.tools.test_phase10_governance_report`
- `python3 03_Implement/tools/planning_queue.py`
