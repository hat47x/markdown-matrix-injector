# Issue: リリース判定のワークフローで権限と同時実行を制御する

この文書は、Phase 7当時のリリース判定ワークフローの権限設定と同時実行制御について、提案と完了判断を残したIssue記録です。2026年4月2日の実行証跡は当時の検証結果であり、現在のGitHub Actionsの動作を新たに確認したものではありません。

## Meta
- Type: Security
- Status: Done
- Priority: Medium
- Scope: `.github/workflows/ci.yml`, `.github/workflows/release-gate-manual.yml`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## 当時の実行計画
### 解決方針（当時の提案）
- リリース判定（release gate）のワークフローに、必要な権限だけを与える設定と、同じ対象に対する同時実行を制御する設定を加える。これにより、不要な権限と実行の競合を抑える。

### 受入条件（Acceptance criteria）
- [x] CI workflowに `permissions: contents: read` が追加される。
- [x] CI workflowにconcurrency設定が追加され、同一refの重複実行がcancelされる。
- [x] manual workflowに `permissions: contents: read` が追加される。
- [x] manual workflowにconcurrency設定が追加される。

### 作業項目（Task breakdown）
- [x] CI workflowへpermissions/concurrencyを追加する。
- [x] manual workflowへpermissions/concurrencyを追加する。
- [x] 検証コマンドを実行し整合性を確認する。

### 当時の検証計画（Validation plan）
- `python3 -m unittest 03_Implement/tools/test_release_gate_check.py 03_Implement/tools/test_release_gate_metrics.py`
- `cd 03_Implement && npm run release:gate:full`
- `python3 03_Implement/tools/planning_queue.py`

## Validation evidence (実行証跡)
### 2026-04-02 (UTC)
- Run date (UTC): `2026-04-02`
- Executor: `agent`
- Commands:
  - `python3 -m unittest 03_Implement/tools/test_release_gate_check.py 03_Implement/tools/test_release_gate_metrics.py`
  - `cd 03_Implement && npm run release:gate:full`
  - `python3 03_Implement/tools/planning_queue.py`
- Result summary:
  - CI/manual workflowに最小権限とconcurrencyを追加。
  - release gateコマンドとユニットテストは継続して成功。
  - planning queueはpending/orphanともに0件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
