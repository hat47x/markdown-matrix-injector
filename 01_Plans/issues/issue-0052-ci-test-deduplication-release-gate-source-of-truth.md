# Issue: CIの重複テスト実行をなくしrelease-gateのG2に責務を集約する

この文書は、Phase 7当時のCIテスト実行の責務整理と完了判断を残したIssue記録です。release-gateのG2をテスト実行の正本とする当時の方針と、2026年4月2日の検証証跡を記載しており、現在のCI実行結果を新たに確認したものではありません。

## Meta
- Type: Refactor
- Status: Done
- Priority: Medium
- Scope: `.github/workflows/ci.yml`, `04_Documentation/phase7-release-readiness.md`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## 当時の実行計画
### 解決方針（当時の提案）
- 当時のCIでは`npm test`が複数の箇所で実行されていたため、テスト実行の責務をrelease-gateのG2に集約する。これに伴い、build jobから重複するテスト実行を取り除く。

### 受入条件（Acceptance criteria）
- [x] `.github/workflows/ci.yml` のbuild jobから直接 `npm test` が削除される。
- [x] release-gate jobが引き続き `release_gate_check.py` を実行し、G2を担保する。
- [x] Phase 7ガイドにCIのtest実行責務（G2正本）が明記される。

### 作業項目（Task breakdown）
- [x] CI workflowのjob構成を見直す。
- [x] 重複テスト実行の削除を適用する。
- [x] ドキュメントへ責務分界を反映する。
- [x] 実行結果をValidation evidenceへ記録する。

### 当時の検証計画（Validation plan）
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
