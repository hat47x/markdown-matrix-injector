# Issue: Phase 10 auditability baseline log

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
- auto-escalationで抽出した候補に対する運用判断（優先度、延期理由、責任者）を監査可能メタデータとして保存するCLIを追加する。
- 候補JSONと判断JSONを突合し、監査ログJSONとMarkdown要約を同時生成する。

### Acceptance criteria (受入条件)
- [x] `python3 01_Plans/tools/phase10_auditability_log.py --candidates <candidates.json> --decisions <decisions.json> --output <audit.json>` で監査ログを生成できる。
- [x] 監査ログの各entryが `candidate_id`, `decision`, `priority`, `owner`, `deferred_reason`, `decided_at` を保持する。
- [x] `decision=defer` 時に `note`（延期理由）が必須であることをテストで保証する。
- [x] Markdown要約に判断履歴テーブルが出力される。
- [x] `python3 -m unittest 01_Plans.tools.test_phase10_auditability_log` が成功する。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時にorphan issueが0件である。

### Task breakdown (作業分解)
- [x] 監査ログ入力契約（candidates + decisions）を定義する。
- [x] auditability log CLIを実装する。
- [x] 単体テストを追加する。
- [x] 検証コマンドを実行し証跡を記録する。

### Validation plan (検証計画)
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
