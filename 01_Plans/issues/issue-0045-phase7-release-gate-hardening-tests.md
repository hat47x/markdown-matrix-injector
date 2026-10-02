# Issue: Phase 7 release gate automation hardening and tests

## Meta
- Type: Test
- Status: Done
- Priority: High
- Scope: `01_Plans/tools/release_gate_check.py`, `01_Plans/tools/test_release_gate_check.py`, `04_Documentation/phase7-release-readiness.md`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## Execution Plan
### Proposed solution (解決策の概要)
- release gateスクリプトにJSON解析失敗時のフォールトトレランスとJSON出力モードを追加する。
- スクリプトの主要分岐（orphan/pending判定、gate順序）をunittestで固定する。

### Acceptance criteria (受入条件)
- [x] `release_gate_check.py` がJSONパース失敗・summary欠落を明示的にfailとして返す。
- [x] `release_gate_check.py --format json` が利用できる。
- [x] `01_Plans/tools/test_release_gate_check.py` が追加され、主要分岐を検証する。
- [x] `python3 -m unittest 01_Plans/tools/test_release_gate_check.py` が成功する。

### Task breakdown (作業分解)
- [x] release gateスクリプトのエラーハンドリングを強化する。
- [x] unittestを追加し、planning判定ロジックを固定する。
- [x] phase7ガイドへオプション運用（json/pending許容）を追記する。
- [x] 実行結果をValidation evidenceへ記録する。

### Validation plan (検証計画)
- `python3 -m unittest 01_Plans/tools/test_release_gate_check.py`
- `python3 01_Plans/tools/release_gate_check.py --format json`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
### 2026-03-31 (UTC)
- Run date (UTC): `2026-03-31`
- Executor: `agent`
- Commands:
  - `python3 -m unittest 01_Plans/tools/test_release_gate_check.py`
  - `python3 01_Plans/tools/release_gate_check.py --format json`
  - `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - release gate scriptにJSON出力とJSON解析失敗時の明示エラーを追加。
  - unittestでplanning summary判定とgate実行順を固定。
  - planning queueはpending/orphanともに0件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
