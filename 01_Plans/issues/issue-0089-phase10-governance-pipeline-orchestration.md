# Issue: Phase 10のガバナンス処理を一つのコマンドで連結実行する

この文書は、Phase 10の個別CLIを連結する当時の方針と完了判断を残したIssue記録です。Execution Evidenceには検証コマンドが記載されていますが、実行日時や成否の出力はありません。現行のパイプライン動作を新たに検証したものではありません。

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: `01_Plans/tools/`, `01_Plans/issues/`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 10 Adoption Operations Governance Automation
- Related ADR/Spec: `01_Plans/adr/ADR-0009-phase10-adoption-operations-governance-automation.md`

## 当時の実行計画
### Proposed solution (解決策の概要)
- Phase 10の個別CLI（harvest／report／SLA／escalation／auditability）を、一つのコマンドから連結実行するためのオーケストレーションCLIを追加する。
- 指定した出力先ディレクトリに各成果物（artifact）をまとめて生成し、週次運用で複数コマンドを手動実行する負担を減らす。

### Acceptance criteria (受入条件)
- [x] `python3 01_Plans/tools/phase10_governance_pipeline.py --gate-inputs ... --decisions ... --output-dir ...` で一連のartifactを生成できる。
- [x] harvest/governance report/SLA/escalation/audit logの各JSONまたはMarkdownが出力される。
- [x] 不正decision（候補ID不一致）時にCLIが `NG:` を返し失敗する。
- [x] `python3 -m unittest 01_Plans.tools.test_phase10_governance_pipeline` が成功する。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時にorphan issueが0件である。

### 作業項目（Task breakdown）
- [x] orchestration CLIを実装する。
- [x] 成功系/失敗系を含むテストを追加する。
- [x] 検証コマンドを実行し証跡を追記する。

### 当時の検証計画（Validation plan）
- `python3 -m unittest 01_Plans.tools.test_phase10_governance_pipeline`
- `python3 -m unittest 01_Plans.tools.test_phase10_auditability_log`
- `python3 01_Plans/tools/planning_queue.py`

## AI読込不要のエビデンス
### Issue Definition
- 個別CLIが揃った後も、週次運用では手作業で複数コマンドを順番に実行する必要があり運用ミス余地が残る。

### Virtual Debate
- Architecture Lead: 既存モジュール関数を再利用し、責務を重複させない軽量オーケストレーションがよい。
- Product/UX Lead: 運用導線は1コマンド化されるべき。生成物一覧を標準出力で返すと利便性が高い。
- QA/Delivery Lead: 失敗系（候補ID不一致）の即時停止とエラーメッセージが必要。

### Synthesis & Decision
- pipeline CLIで既存機能を連結し、成功時はartifact一覧を返す。
- 失敗系は `NG:` と非0終了コードで統一する。

## Execution Evidence
- `python3 -m unittest 01_Plans.tools.test_phase10_governance_pipeline`
- `python3 -m unittest 01_Plans.tools.test_phase10_auditability_log`
- `python3 01_Plans/tools/planning_queue.py`
