# Issue: Phase 7 release gate timeout and skip controls

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `01_Plans/tools/release_gate_check.py`, `01_Plans/tools/test_release_gate_check.py`, `04_Documentation/phase7-release-readiness.md`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## Execution Plan
### Proposed solution (解決策の概要)
- release gate CLIにtimeout制御とdocs-only検証向けskipオプションを追加し、運用現場でのハング/長時間待機を防ぐ。
- unittestを拡張し、新オプションとcommand-not-foundの異常系を回帰検証する。

### Acceptance criteria (受入条件)
- [x] `--planning-timeout-sec` と `--npm-test-timeout-sec` が利用できる。
- [x] `--skip-tests` が利用でき、G2を明示スキップとして記録できる。
- [x] command-not-foundをreturncode 127として扱うテストが存在する。
- [x] `python3 -m unittest 01_Plans/tools/test_release_gate_check.py` が成功する。

### Task breakdown (作業分解)
- [x] release gate CLIにtimeout / skipパラメータを追加する。
- [x] run_commandの例外処理（not found / timeout）を実装する。
- [x] unittestを更新する。
- [x] 運用ドキュメントへ新オプションの使い分けを追記する。

### Validation plan (検証計画)
- `python3 -m unittest 01_Plans/tools/test_release_gate_check.py`
- `python3 01_Plans/tools/release_gate_check.py --format json`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
### 2026-04-02 (UTC)
- Run date (UTC): `2026-04-02`
- Executor: `agent`
- Commands:
  - `python3 -m unittest 01_Plans/tools/test_release_gate_check.py`
  - `python3 01_Plans/tools/release_gate_check.py --format json`
  - `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - release gate CLIにtimeout/skipオプションを追加。
  - unittestを9ケースへ拡張し、新オプションと異常系を固定。
  - planning queueはpending/orphanともに0件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
