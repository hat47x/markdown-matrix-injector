# Issue: Phase 10のパイプラインから他モジュールのprivate API依存をなくす

この文書は、Phase 10のパイプライン内部の依存関係を見直した当時の方針と完了判断を残すIssue記録です。Execution Evidenceは検証コマンドの記載であり、実行日時や成否の出力はありません。現行実装を新たに確認したものではありません。

## Meta
- Type: Refactor
- Status: Done
- Priority: Medium
- Scope: `01_Plans/tools/`, `01_Plans/issues/`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 10 Adoption Operations Governance Automation
- Related ADR/Spec: `01_Plans/adr/ADR-0009-phase10-adoption-operations-governance-automation.md`

## 当時の実行計画
### Proposed solution (解決策の概要)
- ガバナンスパイプラインが、`phase10_evidence_harvest`の非公開ヘルパー`_now_iso`を呼び出す依存関係を解消する。
- パイプライン内に時刻生成の処理を持たせ、モジュール間のprivate APIへの依存を避けることで、将来の変更に伴う影響を抑え、保守しやすくする。

### Acceptance criteria (受入条件)
- [x] `phase10_governance_pipeline.py` が `harvest._now_iso` を参照しない。
- [x] pipeline実行結果の振る舞い（artifact生成・失敗時挙動）が既存テストで維持される。
- [x] `python3 -m unittest 01_Plans.tools.test_phase10_governance_pipeline` が成功する。
- [x] `python3 01_Plans/tools/planning_queue.py` 実行時にorphan issueが0件である。

### 作業項目（Task breakdown）
- [x] pipelineの時刻生成ヘルパーを内部実装する。
- [x] 既存依存を置換する。
- [x] 回帰テストを実行する。

### 当時の検証計画（Validation plan）
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
