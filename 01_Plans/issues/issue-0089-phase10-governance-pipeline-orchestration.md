# Issue: Phase 10 governance pipeline orchestration

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
- phase10 の個別CLI（harvest / report / SLA / escalation / auditability）を1コマンドで連結実行する orchestration CLI を追加する。
- 出力先ディレクトリへ各artifactをまとめて生成し、週次運用の手作業を削減する。

### Acceptance criteria (受入条件)
- [x] `python3 01_Plans/tools/phase10_governance_pipeline.py --gate-inputs ... --decisions ... --output-dir ...` で一連のartifactを生成できる。
- [x] harvest/governance report/SLA/escalation/audit log の各JSONまたはMarkdownが出力される。
- [x] 不正decision（候補ID不一致）時にCLIが `NG:` を返し失敗する。
- [x] `python3 -m unittest 01_Plans.tools.test_phase10_governance_pipeline` が成功する。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時に orphan issue が 0 件である。

### Task breakdown (作業分解)
- [x] orchestration CLIを実装する。
- [x] 成功系/失敗系を含むテストを追加する。
- [x] 検証コマンドを実行し証跡を追記する。

### Validation plan (検証計画)
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
