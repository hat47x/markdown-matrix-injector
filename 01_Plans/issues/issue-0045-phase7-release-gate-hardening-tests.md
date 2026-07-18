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
- release gate スクリプトに JSON 解析失敗時のフォールトトレランスと JSON 出力モードを追加する。
- スクリプトの主要分岐（orphan/pending 判定、gate 順序）を unittest で固定する。

### Acceptance criteria (受入条件)
- [x] `release_gate_check.py` が JSON パース失敗・summary 欠落を明示的に fail として返す。
- [x] `release_gate_check.py --format json` が利用できる。
- [x] `01_Plans/tools/test_release_gate_check.py` が追加され、主要分岐を検証する。
- [x] `python3 -m unittest 01_Plans/tools/test_release_gate_check.py` が成功する。

### Task breakdown (作業分解)
- [x] release gate スクリプトのエラーハンドリングを強化する。
- [x] unittest を追加し、planning 判定ロジックを固定する。
- [x] phase7 ガイドへオプション運用（json/pending許容）を追記する。
- [x] 実行結果を Validation evidence へ記録する。

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
  - release gate script に JSON 出力と JSON 解析失敗時の明示エラーを追加。
  - unittest で planning summary 判定と gate 実行順を固定。
  - planning queue は pending/orphan ともに 0 件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
