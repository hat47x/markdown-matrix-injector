# Issue: Phase 10 backlog auto-escalation rule

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: `01_Plans/tools/`, `01_Plans/issues/`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 10 Adoption Operations Governance Automation
- Related ADR/Spec: `01_Plans/adr/ADR-0009-phase10-adoption-operations-governance-automation.md`

## Execution Plan
### Proposed solution (解決策の概要)
- governance input JSON を再利用し、KPI/SLA の閾値逸脱から起票候補（escalation candidates）を抽出するCLIを追加する。
- 出力は JSON（機械可読）と Markdown（週次運用貼り付け）を同時生成する。
- 閾値比較は adoption lead time / link integrity / print reproducibility / self resolution / SLA breach count を対象にする。

### Acceptance criteria (受入条件)
- [x] `python3 01_Plans/tools/phase10_backlog_escalation.py --input <governance.json> --output <candidates.json>` で候補JSONを生成できる。
- [x] 候補JSONが `candidate_id`, `signal`, `severity`, `summary`, `metric`, `suggested_owner` を保持する。
- [x] KPI逸脱とSLA breach件数逸脱を検知するユニットテストが追加される。
- [x] Markdown要約に候補一覧が出力される。
- [x] `python3 -m unittest 01_Plans.tools.test_phase10_backlog_escalation` が成功する。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時に orphan issue が 0 件である。

### Task breakdown (作業分解)
- [x] 閾値契約を定義する。
- [x] auto-escalation CLIを実装する。
- [x] CLIと候補抽出ロジックの単体テストを追加する。
- [x] 検証コマンドを実行し、Issueへ証跡を追記する。

### Validation plan (検証計画)
- `python3 -m unittest 01_Plans.tools.test_phase10_backlog_escalation`
- `python3 -m unittest 01_Plans.tools.test_phase10_governance_report`
- `python3 01_Plans/tools/planning_queue.py`

## AI読込不要のエビデンス
### Issue Definition
- 週次レポートで閾値逸脱が発生した際、起票候補を自動抽出する導線が未実装。

### Virtual Debate
- Architecture Lead: 既存の governance input 契約を再利用し、別スキーマを増やさないことが保守性に有利。
- Product/UX Lead: 運用担当が即起票できるよう、候補一覧を Markdown でも出力すべき。
- QA/Delivery Lead: KPI逸脱だけでなく SLA breach 件数も検知しないと優先度判断に抜け漏れが出る。

### Synthesis & Decision
- Backlog auto-escalation の最小単位として、governance input から候補JSON/Markdownを生成するCLIを実装する。
- ADR-0009 の段階導入方針範囲内であり、新規ADRは不要。

## Execution Evidence
- `python3 -m unittest 01_Plans.tools.test_phase10_backlog_escalation`
- `python3 -m unittest 01_Plans.tools.test_phase10_governance_report`
- `python3 01_Plans/tools/planning_queue.py`
