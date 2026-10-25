# Issue: PR以外のタイミングでもリリース判定を手動で起動できるようにする

この文書は、Phase 7当時の手動実行用ワークフローの追加と完了判断を残したIssue記録です。2026年4月2日の検証証跡にはコマンド実行結果とワークフロー設定の記録が含まれますが、GitHub上での手動起動や現在の実行結果を新たに確認したものではありません。

## Meta
- Type: Feature
- Status: Done
- Priority: Low
- Scope: `.github/workflows/release-gate-manual.yml`, `04_Documentation/phase7-release-readiness.md`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## 当時の実行計画
### 解決方針（当時の提案）
- プルリクエスト（PR）の作成時以外にも同じリリース判定（release gate）を実行できるように、`workflow_dispatch`から手動で起動できるワークフローを追加する。

### 受入条件（Acceptance criteria）
- [x] `release-gate-manual.yml` が追加される。
- [x] allow-pending / skip-tests / timeoutをworkflow inputで切替可能。
- [x] JSON/Markdown artifactがuploadされる。
- [x] Phase 7ガイドにmanual workflow導線が追加される。

### 作業項目（Task breakdown）
- [x] workflow_dispatch定義を作成する。
- [x] release gate実行コマンドへ入力パラメータを反映する。
- [x] artifact uploadを追加する。
- [x] ガイド文書を更新する。

### 当時の検証計画（Validation plan）
- `python3 -m unittest 03_Implement/tools/test_release_gate_check.py`
- `cd 03_Implement && npm run release:gate:artifacts`
- `python3 03_Implement/tools/planning_queue.py`

## Validation evidence (実行証跡)
### 2026-04-02 (UTC)
- Run date (UTC): `2026-04-02`
- Executor: `agent`
- Commands:
  - `python3 -m unittest 03_Implement/tools/test_release_gate_check.py`
  - `cd 03_Implement && npm run release:gate:artifacts`
  - `python3 03_Implement/tools/planning_queue.py`
- Result summary:
  - 手動起動workflowを追加し、入力パラメータによるrelease gate実行を可能化。
  - JSON/Markdown artifactのuploadを設定。
  - planning queueはpending/orphanともに0件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
