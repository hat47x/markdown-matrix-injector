# Issue: CI test deduplication with release-gate as source of truth

## Meta
- Type: Refactor
- Status: Done
- Priority: Medium
- Scope: `.github/workflows/ci.yml`, `04_Documentation/phase7-release-readiness.md`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## Execution Plan
### Proposed solution (解決策の概要)
- CI内で `npm test` が重複実行されていたため、release-gateのG2を正本化し、build jobから重複実行を除外する。

### Acceptance criteria (受入条件)
- [x] `.github/workflows/ci.yml` のbuild jobから直接 `npm test` が削除される。
- [x] release-gate jobが引き続き `release_gate_check.py` を実行し、G2を担保する。
- [x] Phase 7ガイドにCIのtest実行責務（G2正本）が明記される。

### Task breakdown (作業分解)
- [x] CI workflowのjob構成を見直す。
- [x] 重複テスト実行の削除を適用する。
- [x] ドキュメントへ責務分界を反映する。
- [x] 実行結果をValidation evidenceへ記録する。

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
  - CIのbuild jobから `npm test` を除外し、release-gate jobのG2を正本化。
  - phase7 guideに責務分界を追記。
  - planning queueはpending/orphanともに0件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
