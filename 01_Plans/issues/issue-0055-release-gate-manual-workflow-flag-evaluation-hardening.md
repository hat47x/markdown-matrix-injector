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
- workflow_dispatch 入力の式展開を bash 判定へ置き換え、GitHub 式の短絡評価依存を除去して可搬性を高める。

### Acceptance criteria (受入条件)
- [x] manual workflow の optional flags が bash の `if` で評価される。
- [x] timeout 入力値が env 経由で明示的に渡される。
- [x] 既存 artifact upload フローが維持される。

### Task breakdown (作業分解)
- [x] input を env へマップする。
- [x] `EXTRA_FLAGS` 配列を使った安全な組み立てへ変更する。
- [x] upload ステップの互換性を確認する。

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
  - manual workflow のフラグ評価を bash 条件分岐へ変更。
  - timeout/input 値を env 経由で渡す構成に統一。
  - planning queue は pending/orphan ともに 0 件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
