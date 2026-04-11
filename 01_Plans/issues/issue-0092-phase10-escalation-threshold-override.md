# Issue: Phase 10 escalation threshold override

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `01_Plans/tools/`, `01_Plans/issues/`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 10 Adoption Operations Governance Automation
- Related ADR/Spec: `01_Plans/adr/ADR-0009-phase10-adoption-operations-governance-automation.md`

## Execution Plan
### Proposed solution (解決策の概要)
- backlog auto-escalation の閾値を JSON で外部指定できるようにし、運用現場ごとの基準差異へ対応する。
- governance pipeline も同じ閾値ファイルを受け取り、一貫した候補抽出を行う。

### Acceptance criteria (受入条件)
- [x] `phase10_backlog_escalation.py` が `--thresholds <json>` を受け取り、指定キーのみ上書きできる。
- [x] `phase10_governance_pipeline.py` からも `--thresholds` が渡せる。
- [x] 閾値上書きで候補抽出結果が変化することをテストで確認する。
- [x] `python3 -m unittest 01_Plans.tools.test_phase10_backlog_escalation` が成功する。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時に orphan issue が 0 件である。

### Task breakdown (作業分解)
- [x] 閾値ロード処理を実装する。
- [x] backlog CLI と pipeline CLI に引数を追加する。
- [x] 閾値上書きのテストを追加する。

### Validation plan (検証計画)
- `python3 -m unittest 01_Plans.tools.test_phase10_backlog_escalation`
- `python3 -m unittest 01_Plans.tools.test_phase10_governance_pipeline`
- `python3 01_Plans/tools/planning_queue.py`

## AI読込不要のエビデンス
### Issue Definition
- 固定閾値では運用組織ごとのSLA/KPI基準に適合できない。

### Virtual Debate
- Architecture Lead: 閾値定数を外部化しても既定値は保持し、後方互換を守るべき。
- Product/UX Lead: CLI引数1つで上書きできる体験が望ましい。
- QA/Delivery Lead: 閾値変更時の候補変化を契約テストで固定する必要がある。

### Synthesis & Decision
- 既定値 + 部分上書き方式を採用し、pipeline へも同じ閾値を貫通させる。

## Execution Evidence
- `python3 -m unittest 01_Plans.tools.test_phase10_backlog_escalation`
- `python3 -m unittest 01_Plans.tools.test_phase10_governance_pipeline`
- `python3 01_Plans/tools/planning_queue.py`
