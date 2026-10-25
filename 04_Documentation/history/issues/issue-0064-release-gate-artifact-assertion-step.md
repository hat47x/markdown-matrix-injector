# Issue: リリース判定の成果物が揃っているかをアップロード前に確認する

この文書は、Phase 7当時のリリース判定に成果物の存在確認を追加した提案と完了判断を残したIssue記録です。2026年4月3日の実行証跡は当時の内容であり、現在のCIや手動ワークフローでのアップロード結果を新たに確認したものではありません。

## Meta
- Type: Test
- Status: Done
- Priority: Medium
- Scope: `03_Implement/tools/release_gate_assert_artifacts.py`, `03_Implement/tools/test_release_gate_assert_artifacts.py`, `03_Implement/package.json`, `.github/workflows/release-gate-manual.yml`, `04_Documentation/phase7-release-readiness.md`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## 当時の実行計画
### 解決方針（当時の提案）
- リリース判定の一連の処理（release-gate full実行）の最後に、成果物（artifact）が揃っているかを確認する処理を追加する。アップロード前に不足ファイルを検知できるようにする。

### 受入条件（Acceptance criteria）
- [x] `release_gate_assert_artifacts.py` が追加される。
- [x] assert scriptのunit testが追加される。
- [x] `release:gate:full` にassert stepが組み込まれる。
- [x] manual workflowでもassert stepが実行される。
- [x] Phase 7ガイドにassert script導線が追記される。

### 作業項目（Task breakdown）
- [x] assert script実装。
- [x] unit test実装。
- [x] npm/manual workflow更新。
- [x] 文書更新。

### 当時の検証計画（Validation plan）
- `cd 03_Implement && npm run test:release-gate-tools`
- `cd 03_Implement && npm run release:gate:full`
- `python3 03_Implement/tools/planning_queue.py`

## Validation evidence (実行証跡)
### 2026-04-03 (UTC)
- Run date (UTC): `2026-04-03`
- Executor: `agent`
- Commands:
  - `cd 03_Implement && npm run test:release-gate-tools`
  - `cd 03_Implement && npm run release:gate:full`
  - `python3 03_Implement/tools/planning_queue.py`
- Result summary:
  - artifact assert script/testを追加。
  - full flowとmanual workflowにassertを組み込み。
  - planning queueはpending/orphanともに0件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
