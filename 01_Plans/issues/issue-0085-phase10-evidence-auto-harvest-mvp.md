# Issue: Phase 10 evidence auto-harvest MVP

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
- `docs-check` / `unit` / `integration` / `phase9-sync` の実行結果JSONを1つの収集形式へ正規化し、週次レポート入力へ再利用できる最小ハーベストCLIを追加する。
- 失敗分類（path/sheet/query/render/print）と影響読者（author/reviewer/delivery）を明示的に保持できるスキーマを定義し、未分類時の既定値を固定する。
- 収集結果を `query-evidence` 配下へ保存し、後続IssueでSLA警告・自動起票へ接続できる基盤を整える。

### Acceptance criteria (受入条件)
- [x] ハーベストCLI入力として gate実行結果JSON（複数ファイル）を受け取り、正規化済みartifact JSONを生成できる。
- [x] 出力artifactに `source`, `gate`, `status`, `failure_category`, `impact_persona`, `collected_at` が必須キーとして含まれる。
- [x] `failure_category` が未指定の場合、`unknown` を自動補完する契約がテストで保証される。
- [x] `impact_persona` が未指定の場合、`reviewer` を既定値として補完する契約がテストで保証される。
- [x] 生成artifactが issue-0084 の週次レポート入力契約へそのまま流し込めることを最小統合テストで確認する。
- [x] `python3 -m unittest 01_Plans.tools.test_phase10_evidence_harvest` が成功する。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時に orphan issue が 0 件である。

### Task breakdown (作業分解)
- [x] ハーベスト入力契約と正規化ルールを仕様化する。
- [x] evidence auto-harvest CLIを実装する。
- [x] 単体テストと最小統合テストを追加する。
- [x] 検証コマンドを実行し、Issueへ証跡を追記する。

### Validation plan (検証計画)
- `python3 -m unittest 01_Plans.tools.test_phase10_evidence_harvest`
- `python3 -m unittest 01_Plans.tools.test_phase10_governance_report`
- `python3 01_Plans/tools/planning_queue.py`

## AI読込不要のエビデンス
### Issue Definition
- Phase 10 の次タスクとして、週次レポート運用に必要な「実行結果の自動収集」をどの粒度で先行実装するかが未確定。

### Virtual Debate
- Architecture Lead: まず正規化済みartifact契約を固定しないと、後続のSLA警告や自動起票で互換性崩壊が起きる。
- Product/UX Lead: 利用者価値は「運用データを手作業で貼らなくて済む」こと。CLIで複数JSONを一括処理できる体験を優先すべき。
- QA/Delivery Lead: 既定値ルール（failure_category / impact_persona）が無いと運用データが欠損し、集計不能になる。契約テストで必須化が必要。

### Synthesis & Decision
- Phase 10 の次Issueは evidence auto-harvest MVP とし、収集対象は4ゲート（docs-check/unit/integration/phase9-sync）に限定する。
- 正規化artifactの必須キーと未指定時既定値を契約化し、issue-0084 の週次レポート入力へ接続可能な最小統合テストを受入条件へ含める。
- ADR-0009の方針範囲内（段階導入）であり、不可逆な方針変更は伴わないためADR新規起票は不要と判断。


## Execution Evidence
- `python3 -m unittest 01_Plans.tools.test_phase10_evidence_harvest`
- `python3 -m unittest 01_Plans.tools.test_phase10_governance_report`
- `python3 01_Plans/tools/planning_queue.py`
