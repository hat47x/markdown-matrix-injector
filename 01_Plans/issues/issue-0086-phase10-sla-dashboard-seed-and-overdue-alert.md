# Issue: Phase 10 SLA dashboard seed and overdue alert

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
- issue-0085で収集したevidence artifactを入力として、SLA期限（triage 24h / workaround 72h / permanent fix 7d）を評価するdashboard seed CLIを追加する。
- 期限を超過した項目を機械可読JSONとMarkdown要約の両方で出力し、週次governance reportへ取り込み可能な最小契約を固定する。
- 影響読者（author/reviewer/delivery）と失敗分類（path/sheet/query/render/print/unknown）をそのまま保持し、優先度判断の追跡性を担保する。

### Acceptance criteria (受入条件)
- [x] `python3 01_Plans/tools/phase10_sla_dashboard.py --input <evidence.json> --output <dashboard.json>` でSLA評価結果を生成できる。
- [x] dashboard JSONに `gate`, `status`, `failure_category`, `impact_persona`, `sla_deadline`, `sla_state`（`within_sla` / `overdue`）が必須キーとして含まれる。
- [x] triage/workaround/permanent fixの3期限を判定対象とし、少なくとも1件のoverdueを検知する契約テストが追加される。
- [x] Markdown要約（週次レポート貼り付け用）に「期限超過件数」と「超過内訳（failure_category x impact_persona）」が出力される。
- [x] `python3 -m unittest 01_Plans.tools.test_phase10_sla_dashboard` が成功する。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時にorphan issueが0件である。

### Task breakdown (作業分解)
- [x] SLA評価入力契約（evidence -> dashboard）を仕様化する。
- [x] SLA dashboard seed CLIを実装する。
- [x] overdue検知を含む単体テストを追加する。
- [x] 週次レポート連携用のMarkdown要約出力を実装する。
- [x] 検証コマンドを実行し、Issueへ証跡を追記する。

### Validation plan (検証計画)
- `python3 -m unittest 01_Plans.tools.test_phase10_sla_dashboard`
- `python3 -m unittest 01_Plans.tools.test_phase10_governance_report`
- `python3 01_Plans/tools/planning_queue.py`

## AI読込不要のエビデンス
### Issue Definition
- Phase 10の次作業として、収集済みevidenceを「期限超過が見える状態」へ接続する最小単位（SLA dashboard seed）の契約が未定義。

### Virtual Debate
- Architecture Lead: issue-0085のartifact契約を再利用し、追加項目は `sla_deadline` / `sla_state` に限定すべき。契約拡張を最小化して後続のauto-escalationを壊さないことが重要。
- Product/UX Lead: 週次運用で必要なのは「何件遅れているか」を即読できる要約。JSONだけでなくMarkdown集計を同時出力するべき。
- QA/Delivery Lead: SLA運用は遅延検知が価値の中心。3期限（triage/workaround/permanent fix）それぞれでoverdueケースをテスト固定しないと回帰しやすい。

### Synthesis & Decision
- 次Issueは「SLA dashboard seed and overdue alert」とし、既存evidence artifact契約を入力正本にする。
- 受入条件はmachine-readable JSON + human-readable Markdownの2出力を必須化し、週次レポートへ直結できる形を先に固定する。
- ADR-0009の段階導入方針範囲内であり、不可逆な方針変更は伴わないためADR新規起票は不要と判断。

## Execution Evidence
- `python3 -m unittest 01_Plans.tools.test_phase10_sla_dashboard`
- `python3 -m unittest 01_Plans.tools.test_phase10_governance_report`
- `python3 -m unittest 01_Plans.tools.test_phase10_evidence_harvest`
- `python3 01_Plans/tools/planning_queue.py`
