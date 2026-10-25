# Issue: リリース判定のJSON結果からKPI観測用CSVを生成する

この文書は、Phase 7当時のリリース判定結果をKPI観測向けのCSVに変換する提案と完了判断を残したIssue記録です。CSVの生成とアップロード設定の記録は、導入効果の実測や現在のCI・手動ワークフローの実行確認を意味するものではありません。

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/tools/release_gate_metrics.py`, `03_Implement/tools/test_release_gate_metrics.py`, `.github/workflows/ci.yml`, `.github/workflows/release-gate-manual.yml`, `04_Documentation/phase7-release-readiness.md`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## 当時の実行計画
### 解決方針（当時の提案）
- リリース判定（release gate）のJSON成果物（artifact）から、KPIを観測するための集計CSVを自動生成する。CIと手動実行の結果を同じ形式で記録できるようにする。

### 受入条件（Acceptance criteria）
- [x] `release_gate_metrics.py` が追加される。
- [x] metrics scriptのunit testが追加される。
- [x] CI/manual workflowが `release-gate-metrics.csv` を生成してartifact uploadする。
- [x] Phase 7ガイドにmetrics CSVの導線が追記される。

### 作業項目（Task breakdown）
- [x] JSON -> CSV変換スクリプトを作成する。
- [x] unittestを追加する。
- [x] workflowを更新する。
- [x] ガイド文書を更新する。

### 当時の検証計画（Validation plan）
- `python3 -m unittest 03_Implement/tools/test_release_gate_check.py 03_Implement/tools/test_release_gate_metrics.py`
- `cd 03_Implement && npm run release:gate:artifacts`
- `python3 03_Implement/tools/release_gate_metrics.py --input-file artifacts/release-gate.json --output-file artifacts/release-gate-metrics.csv`
- `python3 03_Implement/tools/planning_queue.py`

## Validation evidence (実行証跡)
### 2026-04-02 (UTC)
- Run date (UTC): `2026-04-02`
- Executor: `agent`
- Commands:
  - `python3 -m unittest 03_Implement/tools/test_release_gate_check.py 03_Implement/tools/test_release_gate_metrics.py`
  - `cd 03_Implement && npm run release:gate:artifacts`
  - `python3 03_Implement/tools/release_gate_metrics.py --input-file artifacts/release-gate.json --output-file artifacts/release-gate-metrics.csv`
  - `python3 03_Implement/tools/planning_queue.py`
- Result summary:
  - release gate JSONからKPI集計CSVを生成するスクリプトを追加。
  - CI/manual workflowがmetrics CSVをartifactへ追加。
  - planning queueはpending/orphanともに0件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
