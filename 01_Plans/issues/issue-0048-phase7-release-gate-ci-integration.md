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
- release gate チェックをローカル運用だけでなく CI に組み込み、PR 時点で G1/G2 の退行を自動検知できるようにする。

### Acceptance criteria (受入条件)
- [x] `.github/workflows/ci.yml` に `release-gate` job が追加される。
- [x] `release-gate` job で `python3 01_Plans/tools/release_gate_check.py --format json` が実行される。
- [x] Phase 7 ガイドに CI 連携が追記される。

### Task breakdown (作業分解)
- [x] CI workflow を更新する。
- [x] 必要な Python/Node セットアップを workflow に追加する。
- [x] Phase 7 運用ガイドへ CI 実行方針を追記する。
- [x] 実行結果を Validation evidence へ記録する。

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
  - CI に release-gate job を追加し、PR 時に自動実行されるようにした。
  - phase7 guide に CI 連携を追記。
  - ローカル検証で release gate / planning queue / unittest がすべて成功。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
