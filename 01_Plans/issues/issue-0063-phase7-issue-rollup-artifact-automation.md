# Issue: Phase 7のIssue状況一覧をMarkdown成果物として自動生成する

この文書は、Phase 7当時のIssueの状況を一覧化する仕組みと完了判断を残したIssue記録です。2026年4月3日の実行証跡は当時の内容であり、現在のIssue状況やCI・手動実行での成果物取得を新たに確認したものではありません。

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `01_Plans/tools/phase7_issue_rollup.py`, `01_Plans/tools/test_phase7_issue_rollup.py`, `03_Implement/package.json`, `.github/workflows/ci.yml`, `.github/workflows/release-gate-manual.yml`, `04_Documentation/phase7-release-readiness.md`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## 当時の実行計画
### 解決方針（当時の提案）
- Phase 7に関するIssueが増え、状況を把握しにくくなっていたため、各Issueの状態をまとめた一覧をMarkdown形式の成果物（artifact）として自動生成できるようにする。

### 受入条件（Acceptance criteria）
- [x] `phase7_issue_rollup.py` が追加される。
- [x] rollup scriptのunit testが追加される。
- [x] `release:gate:full` 実行でrollup artifactが生成される。
- [x] CI/manual workflowがrollup artifactをuploadする。
- [x] Phase 7ガイドへrollup artifact導線が追記される。

### 作業項目（Task breakdown）
- [x] rollup script作成。
- [x] test作成。
- [x] npm/CI/manual workflow更新。
- [x] 文書更新。

### 当時の検証計画（Validation plan）
- `cd 03_Implement && npm run test:release-gate-tools`
- `cd 03_Implement && npm run release:gate:full`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
### 2026-04-03 (UTC)
- Run date (UTC): `2026-04-03`
- Executor: `agent`
- Commands:
  - `cd 03_Implement && npm run test:release-gate-tools`
  - `cd 03_Implement && npm run release:gate:full`
  - `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - phase7 issue rollupを自動生成するscript/testを追加。
  - full flowとCI/manual artifactへrollupを組み込み。
  - planning queueはpending/orphanともに0件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
