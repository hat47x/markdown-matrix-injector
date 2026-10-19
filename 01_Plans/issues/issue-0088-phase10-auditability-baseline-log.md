# Issue: Phase 10の運用判断を監査ログに記録する

この文書は、Phase 10で起票候補に対する運用判断を記録する当時の方針と完了判断を残したIssue記録です。Execution Evidenceには検証コマンドが記載されていますが、実行日時や成否の出力はありません。現行の監査ログ生成を新たに検証したものではありません。

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
- 自動エスカレーション（auto-escalation）で抽出した起票候補について、優先度・延期理由・責任者などの運用判断を、監査時に追跡できるメタデータとして保存するCLIを追加する。
- 起票候補のJSONと判断内容のJSONを照合し、監査ログのJSONと、人が確認するためのMarkdown要約をあわせて生成する。

### Acceptance criteria (受入条件)
- [x] `python3 01_Plans/tools/phase10_auditability_log.py --candidates <candidates.json> --decisions <decisions.json> --output <audit.json>` で監査ログを生成できる。
- [x] 監査ログの各entryが `candidate_id`, `decision`, `priority`, `owner`, `deferred_reason`, `decided_at` を保持する。
- [x] `decision=defer` 時に `note`（延期理由）が必須であることをテストで保証する。
- [x] Markdown要約に判断履歴テーブルが出力される。
- [x] `python3 -m unittest 01_Plans.tools.test_phase10_auditability_log` が成功する。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時にorphan issueが0件である。

### 作業項目（Task breakdown）
- [x] 監査ログ入力契約（candidates + decisions）を定義する。
- [x] auditability log CLIを実装する。
- [x] 単体テストを追加する。
- [x] 検証コマンドを実行し証跡を記録する。

### 当時の検証計画（Validation plan）
- `python3 -m unittest 01_Plans.tools.test_phase10_auditability_log`
- `python3 -m unittest 01_Plans.tools.test_phase10_backlog_escalation`
- `python3 01_Plans/tools/planning_queue.py`

## AI読込不要のエビデンス
### Issue Definition
- 運用判断（優先度・延期理由・責任者）を監査可能に残す導線が未実装。

### Virtual Debate
- Architecture Lead: 候補抽出結果を入力として再利用し、決定ログを別JSONで積み上げる構造が拡張に強い。
- Product/UX Lead: 人が読む運用導線として、JSONだけでなくMarkdown表も必要。
- QA/Delivery Lead: `defer` 時の延期理由未入力は監査上の欠陥なので契約で必須化すべき。

### Synthesis & Decision
- candidates + decisionsの突合から監査ログを生成し、延期理由必須ルールをテスト固定する。
- ADR-0009のAuditability baseline要件範囲内であり、新規ADRは不要。

## Execution Evidence
- `python3 -m unittest 01_Plans.tools.test_phase10_auditability_log`
- `python3 -m unittest 01_Plans.tools.test_phase10_backlog_escalation`
- `python3 01_Plans/tools/planning_queue.py`
