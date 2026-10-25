# Issue: Phase 10でKPI・SLAの逸脱から起票候補を抽出する

この文書は、Phase 10の起票候補抽出について当時の方針と完了判断を残したIssue記録です。下部のsuperseded注記のとおり、当時列挙した指標の一部はADR-0012 D6で置き換えられており、現行の閾値・シグナル定義はIssue 0103を参照します。Execution Evidenceにはコマンドのみが記載され、実行日時や成否の出力はありません。

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: `03_Implement/tools/`, `04_Documentation/history/issues/`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 10 Adoption Operations Governance Automation
- Related ADR/Spec: `01_Plans/adr/ADR-0009-phase10-adoption-operations-governance-automation.md`

## 当時の実行計画
### Proposed solution (解決策の概要)
- 既存のガバナンス入力JSONを再利用し、KPIやSLAが閾値を超えた場合に、起票候補（escalation candidates）を抽出するCLIを追加する。
- 抽出結果は、機械処理用のJSONと週次運用の記録に貼り付けるMarkdownを同時に生成する。
- 当時の閾値比較では、adoption lead time／link integrity／print reproducibility／self resolution／SLA breach countを対象とする。後に置き換えられた指標については末尾のsuperseded注記を参照する。

### Acceptance criteria (受入条件)
- [x] `python3 03_Implement/tools/phase10_backlog_escalation.py --input <governance.json> --output <candidates.json>` で候補JSONを生成できる。
- [x] 候補JSONが `candidate_id`, `signal`, `severity`, `summary`, `metric`, `suggested_owner` を保持する。
- [x] KPI逸脱とSLA breach件数逸脱を検知するユニットテストが追加される。
- [x] Markdown要約に候補一覧が出力される。
- [x] `python3 -m unittest 01_Plans.tools.test_phase10_backlog_escalation` が成功する。
- [x] `python3 03_Implement/tools/planning_queue.py` 実行時にorphan issueが0件である。

### 作業項目（Task breakdown）
- [x] 閾値契約を定義する。
- [x] auto-escalation CLIを実装する。
- [x] CLIと候補抽出ロジックの単体テストを追加する。
- [x] 検証コマンドを実行し、Issueへ証跡を追記する。

### 当時の検証計画（Validation plan）
- `python3 -m unittest 01_Plans.tools.test_phase10_backlog_escalation`
- `python3 -m unittest 01_Plans.tools.test_phase10_governance_report`
- `python3 03_Implement/tools/planning_queue.py`

## AI読込不要のエビデンス
### Issue Definition
- 週次レポートで閾値逸脱が発生した際、起票候補を自動抽出する導線が未実装。

### Virtual Debate
- Architecture Lead: 既存のgovernance input契約を再利用し、別スキーマを増やさないことが保守性に有利。
- Product/UX Lead: 運用担当が即起票できるよう、候補一覧をMarkdownでも出力すべき。
- QA/Delivery Lead: KPI逸脱だけでなくSLA breach件数も検知しないと優先度判断に抜け漏れが出る。

### Synthesis & Decision
- Backlog auto-escalationの最小単位として、governance inputから候補JSON/Markdownを生成するCLIを実装する。
- ADR-0009の段階導入方針範囲内であり、新規ADRは不要。

## Execution Evidence
- `python3 -m unittest 01_Plans.tools.test_phase10_backlog_escalation`
- `python3 -m unittest 01_Plans.tools.test_phase10_governance_report`
- `python3 03_Implement/tools/planning_queue.py`

## Note (superseded)
- 上記Proposed solution / Acceptance criteriaの "adoption lead time / link integrity / print reproducibility / self
  resolution" の指標一覧はADR-0012 D6により置き換えられた。現行の閾値・シグナル定義は `issue-0103` を参照。
  本issueのDone記録・実行証跡は当時の実装事実として変更しない。
