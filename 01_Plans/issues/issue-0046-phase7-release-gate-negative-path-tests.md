# Issue: Phase 7 release gate negative-path test coverage

## Meta
- Type: Test
- Status: Done
- Priority: Medium
- Scope: `01_Plans/tools/test_release_gate_check.py`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## Execution Plan
### Proposed solution (解決策の概要)
- release gateの正常系だけでなく、運用時に起こりやすい異常系（JSON破損、summary欠落、test失敗）をunittestで固定し、回帰を防止する。

### Acceptance criteria (受入条件)
- [x] planning gateのJSONパース失敗ケースがテストされる。
- [x] planning gateのsummary欠落ケースがテストされる。
- [x] test gate失敗時にログ末尾を返す挙動がテストされる。
- [x] `python3 -m unittest 01_Plans/tools/test_release_gate_check.py` が成功する。

### Task breakdown (作業分解)
- [x] 異常系テストケースを追加する。
- [x] 既存の正常系テストと合わせて回帰検証を実行する。
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
  - JSONパース失敗 / summary欠落 / npm test fail-tailの異常系テストを追加。
  - release gate checker本体のJSON出力が継続して成功することを確認。
  - planning queueはpending/orphanともに0件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
