# Issue: Phase 10 pipeline private API hardening

## Meta
- Type: Refactor
- Status: Done
- Priority: Medium
- Scope: `01_Plans/tools/`, `01_Plans/issues/`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 10 Adoption Operations Governance Automation
- Related ADR/Spec: `01_Plans/adr/ADR-0009-phase10-adoption-operations-governance-automation.md`

## Execution Plan
### Proposed solution (解決策の概要)
- governance pipelineが `phase10_evidence_harvest` の私有ヘルパー `_now_iso` に依存している箇所を除去する。
- pipeline内で独自に時刻生成を持つことでモジュール間のprivate API依存を解消し、保守性を高める。

### Acceptance criteria (受入条件)
- [x] `phase10_governance_pipeline.py` が `harvest._now_iso` を参照しない。
- [x] pipeline実行結果の振る舞い（artifact生成・失敗時挙動）が既存テストで維持される。
- [x] `python3 -m unittest 01_Plans.tools.test_phase10_governance_pipeline` が成功する。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時にorphan issueが0件である。

### Task breakdown (作業分解)
- [x] pipelineの時刻生成ヘルパーを内部実装する。
- [x] 既存依存を置換する。
- [x] 回帰テストを実行する。

### Validation plan (検証計画)
- `python3 -m unittest 01_Plans.tools.test_phase10_governance_pipeline`
- `python3 -m unittest 01_Plans.tools.test_phase10_artifact_manifest`
- `python3 01_Plans/tools/planning_queue.py`

## AI読込不要のエビデンス
### Issue Definition
- pipelineが他モジュールのprivate APIに依存しており、将来的な改修で破壊されるリスクがある。

### Virtual Debate
- Architecture Lead: private API依存は回避すべきで、境界を明確にすることが重要。
- Product/UX Lead: ユーザー影響なく内部品質を改善する小粒度リファクタが望ましい。
- QA/Delivery Lead: 既存テストで振る舞いが変わらないことを確認する。

### Synthesis & Decision
- pipeline内 `_now_iso` を追加しprivate API依存を排除する。

## Execution Evidence
- `python3 -m unittest 01_Plans.tools.test_phase10_governance_pipeline`
- `python3 -m unittest 01_Plans.tools.test_phase10_artifact_manifest`
- `python3 01_Plans/tools/planning_queue.py`
