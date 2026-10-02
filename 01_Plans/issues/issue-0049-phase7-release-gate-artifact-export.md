# Issue: Phase 7 release gate artifact export

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `01_Plans/tools/release_gate_check.py`, `01_Plans/tools/test_release_gate_check.py`, `.github/workflows/ci.yml`, `04_Documentation/phase7-release-readiness.md`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## Execution Plan
### Proposed solution (解決策の概要)
- release gate結果をJSONファイルとして保存できるようにし、CI artifactとして監査可能な証跡を残す。

### Acceptance criteria (受入条件)
- [x] `release_gate_check.py` に `--output-file` が追加される。
- [x] JSON結果のシリアライズ/保存ロジックに対するテストが追加される。
- [x] CIが `artifacts/release-gate.json` をアップロードする。
- [x] Phase 7ガイドにoutput-file運用が追記される。

### Task breakdown (作業分解)
- [x] release gate CLIへJSON export機能を追加する。
- [x] unittestを拡張する。
- [x] CI workflowにartifact uploadを追加する。
- [x] ドキュメントへ運用手順を反映する。

### Validation plan (検証計画)
- `python3 -m unittest 01_Plans/tools/test_release_gate_check.py`
- `python3 01_Plans/tools/release_gate_check.py --format json --output-file artifacts/release-gate.json`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
### 2026-04-02 (UTC)
- Run date (UTC): `2026-04-02`
- Executor: `agent`
- Commands:
  - `python3 -m unittest 01_Plans/tools/test_release_gate_check.py`
  - `python3 01_Plans/tools/release_gate_check.py --format json --output-file artifacts/release-gate.json`
  - `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - release gate CLIがJSON結果をファイル出力可能になった。
  - CI workflowが `release-gate-report` artifactをアップロードするようになった。
  - planning queueはpending/orphanともに0件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
