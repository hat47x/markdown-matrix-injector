# Issue: Release gate manual workflow_dispatch support

## Meta
- Type: Feature
- Status: Done
- Priority: Low
- Scope: `.github/workflows/release-gate-manual.yml`, `04_Documentation/phase7-release-readiness.md`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## Execution Plan
### Proposed solution (解決策の概要)
- PR以外のタイミングでも同一release gateを再実行できるよう、workflow_dispatchで手動起動可能なworkflowを追加する。

### Acceptance criteria (受入条件)
- [x] `release-gate-manual.yml` が追加される。
- [x] allow-pending / skip-tests / timeoutをworkflow inputで切替可能。
- [x] JSON/Markdown artifactがuploadされる。
- [x] Phase 7ガイドにmanual workflow導線が追加される。

### Task breakdown (作業分解)
- [x] workflow_dispatch定義を作成する。
- [x] release gate実行コマンドへ入力パラメータを反映する。
- [x] artifact uploadを追加する。
- [x] ガイド文書を更新する。

### Validation plan (検証計画)
- `python3 -m unittest 01_Plans/tools/test_release_gate_check.py`
- `cd 03_Implement && npm run release:gate:artifacts`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
### 2026-04-02 (UTC)
- Run date (UTC): `2026-04-02`
- Executor: `agent`
- Commands:
  - `python3 -m unittest 01_Plans/tools/test_release_gate_check.py`
  - `cd 03_Implement && npm run release:gate:artifacts`
  - `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - 手動起動workflowを追加し、入力パラメータによるrelease gate実行を可能化。
  - JSON/Markdown artifactのuploadを設定。
  - planning queueはpending/orphanともに0件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
