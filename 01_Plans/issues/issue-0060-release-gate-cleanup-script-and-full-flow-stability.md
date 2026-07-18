# Issue: Release gate cleanup script and full-flow stability

## Meta
- Type: Refactor
- Status: Done
- Priority: Medium
- Scope: `01_Plans/tools/release_gate_clean.py`, `01_Plans/tools/test_release_gate_clean.py`, `03_Implement/package.json`, `04_Documentation/phase7-release-readiness.md`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## Execution Plan
### Proposed solution (解決策の概要)
- release-gate 実行前に古い artifact を自動で掃除し、full 実行の再現性を向上させる。

### Acceptance criteria (受入条件)
- [x] `release_gate_clean.py` が追加される。
- [x] cleanup 挙動の unit test が追加される。
- [x] `release:gate:full` が cleanup -> gate -> metrics の順で動作する。
- [x] ガイドに cleanup 導線が追記される。

### Task breakdown (作業分解)
- [x] cleanup スクリプトを追加する。
- [x] unittest を追加する。
- [x] npm scripts を更新する。
- [x] ドキュメントへ反映する。

### Validation plan (検証計画)
- `python3 -m unittest 01_Plans/tools/test_release_gate_check.py 01_Plans/tools/test_release_gate_metrics.py 01_Plans/tools/test_release_gate_clean.py`
- `cd 03_Implement && npm run release:gate:full`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
### 2026-04-02 (UTC)
- Run date (UTC): `2026-04-02`
- Executor: `agent`
- Commands:
  - `python3 -m unittest 01_Plans/tools/test_release_gate_check.py 01_Plans/tools/test_release_gate_metrics.py 01_Plans/tools/test_release_gate_clean.py`
  - `cd 03_Implement && npm run release:gate:full`
  - `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - cleanup スクリプト追加により stale artifact を除去可能化。
  - release:gate:full は cleanup を先頭に実行するよう更新。
  - planning queue は pending/orphan ともに 0 件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
