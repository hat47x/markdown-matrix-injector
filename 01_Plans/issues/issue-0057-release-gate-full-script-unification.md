# Issue: Release gate full script unification across CI and local runs

## Meta
- Type: Refactor
- Status: Done
- Priority: Medium
- Scope: `03_Implement/package.json`, `.github/workflows/ci.yml`, `.github/workflows/release-gate-manual.yml`, `04_Documentation/phase7-release-readiness.md`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## Execution Plan
### Proposed solution (解決策の概要)
- release gate 本体 + metrics 生成を 1 つの npm script (`release:gate:full`) へ統合し、CI/local/manual の実行差異を最小化する。

### Acceptance criteria (受入条件)
- [x] `03_Implement/package.json` に `release:gate:full` が追加される。
- [x] CI release-gate job が `npm run release:gate:full` を使う。
- [x] manual workflow が `repo-root ..` 前提で同等の出力を維持する。
- [x] Phase 7 ガイドに `release:gate:full` の導線が追記される。

### Task breakdown (作業分解)
- [x] package scripts 追加。
- [x] CI workflow のステップ簡素化。
- [x] manual workflow のコマンド整列。
- [x] ガイド更新と証跡記録。

### Validation plan (検証計画)
- `cd 03_Implement && npm run release:gate:full`
- `python3 -m unittest 01_Plans/tools/test_release_gate_check.py 01_Plans/tools/test_release_gate_metrics.py`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
### 2026-04-02 (UTC)
- Run date (UTC): `2026-04-02`
- Executor: `agent`
- Commands:
  - `cd 03_Implement && npm run release:gate:full`
  - `python3 -m unittest 01_Plans/tools/test_release_gate_check.py 01_Plans/tools/test_release_gate_metrics.py`
  - `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - release gate + metrics を単一 npm script に統合。
  - CI/manual とローカルの実行導線を揃えた。
  - planning queue は pending/orphan ともに 0 件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
