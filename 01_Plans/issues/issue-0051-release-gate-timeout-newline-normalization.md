# Issue: Release gate timeout test and newline normalization

## Meta
- Type: Test
- Status: Done
- Priority: Medium
- Scope: `01_Plans/tools/release_gate_check.py`, `01_Plans/tools/test_release_gate_check.py`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## Execution Plan
### Proposed solution (解決策の概要)
- release gate helperの細部品質を向上させるため、timeout分岐をunittestで固定し、artifact出力時の改行を1回に正規化する。

### Acceptance criteria (受入条件)
- [x] `run_command` のtimeout分岐がunittestで検証される。
- [x] `write_output_file` が末尾改行を重複させない。
- [x] 追加テストを含め `python3 -m unittest 01_Plans/tools/test_release_gate_check.py` が成功する。

### Task breakdown (作業分解)
- [x] newline正規化ヘルパーを追加する。
- [x] timeout/改行正規化のunittestを追加する。
- [x] 実行結果をValidation evidenceに記録する。

### Validation plan (検証計画)
- `python3 -m unittest 01_Plans/tools/test_release_gate_check.py`
- `python3 01_Plans/tools/release_gate_check.py --format json --output-file artifacts/release-gate.json --output-markdown-file artifacts/release-gate.md`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
### 2026-04-02 (UTC)
- Run date (UTC): `2026-04-02`
- Executor: `agent`
- Commands:
  - `python3 -m unittest 01_Plans/tools/test_release_gate_check.py`
  - `python3 01_Plans/tools/release_gate_check.py --format json --output-file artifacts/release-gate.json --output-markdown-file artifacts/release-gate.md`
  - `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - timeout分岐のunittestを追加し、run_commandの124戻り値を固定。
  - artifact出力で末尾改行を1回に正規化。
  - planning queueはpending/orphanともに0件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
