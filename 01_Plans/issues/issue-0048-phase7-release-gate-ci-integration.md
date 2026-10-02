# Issue: Phase 7 release gate CI integration

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `.github/workflows/ci.yml`, `04_Documentation/phase7-release-readiness.md`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## Execution Plan
### Proposed solution (解決策の概要)
- release gateチェックをローカル運用だけでなくCIに組み込み、PR時点でG1/G2の退行を自動検知できるようにする。

### Acceptance criteria (受入条件)
- [x] `.github/workflows/ci.yml` に `release-gate` jobが追加される。
- [x] `release-gate` jobで `python3 01_Plans/tools/release_gate_check.py --format json` が実行される。
- [x] Phase 7ガイドにCI連携が追記される。

### Task breakdown (作業分解)
- [x] CI workflowを更新する。
- [x] 必要なPython/Nodeセットアップをworkflowに追加する。
- [x] Phase 7運用ガイドへCI実行方針を追記する。
- [x] 実行結果をValidation evidenceへ記録する。

### Validation plan (検証計画)
- `python3 01_Plans/tools/release_gate_check.py --format json`
- `python3 01_Plans/tools/planning_queue.py`
- `python3 -m unittest 01_Plans/tools/test_release_gate_check.py`

## Validation evidence (実行証跡)
### 2026-04-02 (UTC)
- Run date (UTC): `2026-04-02`
- Executor: `agent`
- Commands:
  - `python3 01_Plans/tools/release_gate_check.py --format json`
  - `python3 01_Plans/tools/planning_queue.py`
  - `python3 -m unittest 01_Plans/tools/test_release_gate_check.py`
- Result summary:
  - CIにrelease-gate jobを追加し、PR時に自動実行されるようにした。
  - phase7 guideにCI連携を追記。
  - ローカル検証でrelease gate / planning queue / unittestがすべて成功。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
