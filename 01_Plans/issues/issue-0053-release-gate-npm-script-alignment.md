# Issue: Release gate npm script alignment for local and CI execution

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/package.json`, `.github/workflows/ci.yml`, `04_Documentation/phase7-release-readiness.md`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## Execution Plan
### Proposed solution (解決策の概要)
- release gate実行コマンドを `03_Implement/package.json` scriptsに集約し、ローカル実行とCI実行の乖離をなくす。

### Acceptance criteria (受入条件)
- [x] `03_Implement/package.json` に `release:gate` と `release:gate:artifacts` が追加される。
- [x] CI `release-gate` jobがnpm script経由で実行される。
- [x] Phase 7ガイドにnpm script導線が追記される。

### Task breakdown (作業分解)
- [x] package scriptsを追加する。
- [x] CI workflowの実行コマンドを差し替える。
- [x] ガイド文書を更新する。
- [x] 実行結果をValidation evidenceへ記録する。

### Validation plan (検証計画)
- `cd 03_Implement && npm run release:gate:artifacts`
- `python3 -m unittest 01_Plans/tools/test_release_gate_check.py`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
### 2026-04-02 (UTC)
- Run date (UTC): `2026-04-02`
- Executor: `agent`
- Commands:
  - `cd 03_Implement && npm run release:gate:artifacts`
  - `python3 -m unittest 01_Plans/tools/test_release_gate_check.py`
  - `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - package scriptsでrelease gate実行を共通化。
  - CIはnpm scriptを利用する構成へ移行。
  - planning queueはpending/orphanともに0件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
