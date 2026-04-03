# Issue: Phase 7 release gate automation MVP

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: `01_Plans/tools/release_gate_check.py`, `04_Documentation/phase7-release-readiness.md`, `04_Documentation/README.md`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## Execution Plan
### Proposed solution (解決策の概要)
- Phase 7 の G1/G2 を手動実行から最小自動化し、release 判定時の漏れを減らす。
- `planning_queue` JSON を取り込み、orphan/pending 判定と `npm test` 実行を1コマンドで行う。

### Acceptance criteria (受入条件)
- [x] `01_Plans/tools/release_gate_check.py` が追加され、G1（planning）とG2（test）を一括実行できる。
- [x] pending issue 許容の有無を `--allow-pending-issues` で切替できる。
- [x] `04_Documentation/phase7-release-readiness.md` に自動ゲート実行手順が反映される。
- [x] `python3 01_Plans/tools/release_gate_check.py` が成功終了する。

### Task breakdown (作業分解)
- [x] release gate 実行スクリプトを実装する。
- [x] phase7 ガイドへ自動実行手順を追記する。
- [x] README の Phase 7 導線に自動実行コマンドを追加する。
- [x] 実行結果を Validation evidence として記録する。

### Validation plan (検証計画)
- `python3 01_Plans/tools/release_gate_check.py`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
### 2026-03-31 (UTC)
- Run date (UTC): `2026-03-31`
- Executor: `agent`
- Commands:
  - `python3 01_Plans/tools/release_gate_check.py`
  - `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - G1/G2 を自動判定する `release_gate_check.py` を追加。
  - `phase7-release-readiness.md` に自動実行フローを反映。
  - planning queue で pending/orphan が 0 件であることを確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
