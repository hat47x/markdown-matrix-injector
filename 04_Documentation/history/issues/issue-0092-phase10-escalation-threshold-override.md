# Issue: Phase 10のエスカレーション閾値をJSONで上書きできるようにする

この文書は、Phase 10の起票候補抽出で閾値を外部指定する当時の方針と完了判断を残すIssue記録です。Execution Evidenceは検証コマンドの記載であり、実行日時や成否の出力はありません。現行の閾値定義やCLI動作を新たに確認したものではありません。

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/tools/`, `04_Documentation/history/issues/`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 10 Adoption Operations Governance Automation
- Related ADR/Spec: `01_Plans/adr/ADR-0009-phase10-adoption-operations-governance-automation.md`

## 当時の実行計画
### Proposed solution (解決策の概要)
- バックログの自動エスカレーションで使う閾値をJSONから指定できるようにし、運用組織ごとの基準の違いに対応する。
- ガバナンスパイプラインも同じ閾値ファイルを受け取れるようにし、単独CLIと連結実行の双方で同じ基準を使って候補を抽出する。

### Acceptance criteria (受入条件)
- [x] `phase10_backlog_escalation.py` が `--thresholds <json>` を受け取り、指定キーのみ上書きできる。
- [x] `phase10_governance_pipeline.py` からも `--thresholds` が渡せる。
- [x] 閾値上書きで候補抽出結果が変化することをテストで確認する。
- [x] `python3 -m unittest 01_Plans.tools.test_phase10_backlog_escalation` が成功する。
- [x] `python3 03_Implement/tools/planning_queue.py` 実行時にorphan issueが0件である。

### 作業項目（Task breakdown）
- [x] 閾値ロード処理を実装する。
- [x] backlog CLIとpipeline CLIに引数を追加する。
- [x] 閾値上書きのテストを追加する。

### 当時の検証計画（Validation plan）
- `python3 -m unittest 01_Plans.tools.test_phase10_backlog_escalation`
- `python3 -m unittest 01_Plans.tools.test_phase10_governance_pipeline`
- `python3 03_Implement/tools/planning_queue.py`

## AI読込不要のエビデンス
### Issue Definition
- 固定閾値では運用組織ごとのSLA/KPI基準に適合できない。

### Virtual Debate
- Architecture Lead: 閾値定数を外部化しても既定値は保持し、後方互換を守るべき。
- Product/UX Lead: CLI引数1つで上書きできる体験が望ましい。
- QA/Delivery Lead: 閾値変更時の候補変化を契約テストで固定する必要がある。

### Synthesis & Decision
- 既定値 + 部分上書き方式を採用し、pipelineへも同じ閾値を貫通させる。

## Execution Evidence
- `python3 -m unittest 01_Plans.tools.test_phase10_backlog_escalation`
- `python3 -m unittest 01_Plans.tools.test_phase10_governance_pipeline`
- `python3 03_Implement/tools/planning_queue.py`
