# Issue: Release gate manual workflow flag evaluation hardening

## Meta
- Type: Refactor
- Status: Done
- Priority: Medium
- Scope: `.github/workflows/release-gate-manual.yml`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## Execution Plan
### Proposed solution (解決策の概要)
- workflow_dispatch入力の式展開をbash判定へ置き換え、GitHub式の短絡評価依存を除去して可搬性を高める。

### Acceptance criteria (受入条件)
- [x] manual workflowのoptional flagsがbashの `if` で評価される。
- [x] timeout入力値がenv経由で明示的に渡される。
- [x] 既存artifact uploadフローが維持される。

### Task breakdown (作業分解)
- [x] inputをenvへマップする。
- [x] `EXTRA_FLAGS` 配列を使った安全な組み立てへ変更する。
- [x] uploadステップの互換性を確認する。

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
  - manual workflowのフラグ評価をbash条件分岐へ変更。
  - timeout/input値をenv経由で渡す構成に統一。
  - planning queueはpending/orphanともに0件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
