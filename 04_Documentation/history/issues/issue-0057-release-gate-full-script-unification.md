# Issue: リリース判定と指標生成を共通のnpm scriptで実行する

この文書は、Phase 7当時のリリース判定と指標生成を一つの実行コマンドにまとめる提案と完了判断を残したIssue記録です。CI・ローカル・手動起動の実行導線に関する2026年4月2日の証跡は当時のものであり、現行環境での実行結果を新たに確認したものではありません。

## Meta
- Type: Refactor
- Status: Done
- Priority: Medium
- Scope: `03_Implement/package.json`, `.github/workflows/ci.yml`, `.github/workflows/release-gate-manual.yml`, `04_Documentation/phase7-release-readiness.md`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## 当時の実行計画
### 解決方針（当時の提案）
- リリース判定本体と指標（metrics）の生成を、`release:gate:full`という一つのnpm scriptにまとめる。CI・ローカル・手動起動で実行手順が食い違わないようにする。

### 受入条件（Acceptance criteria）
- [x] `03_Implement/package.json` に `release:gate:full` が追加される。
- [x] CI release-gate jobが `npm run release:gate:full` を使う。
- [x] manual workflowが `repo-root ..` 前提で同等の出力を維持する。
- [x] Phase 7ガイドに `release:gate:full` の導線が追記される。

### 作業項目（Task breakdown）
- [x] package scripts追加。
- [x] CI workflowのステップ簡素化。
- [x] manual workflowのコマンド整列。
- [x] ガイド更新と証跡記録。

### 当時の検証計画（Validation plan）
- `cd 03_Implement && npm run release:gate:full`
- `python3 -m unittest 03_Implement/tools/test_release_gate_check.py 03_Implement/tools/test_release_gate_metrics.py`
- `python3 03_Implement/tools/planning_queue.py`

## Validation evidence (実行証跡)
### 2026-04-02 (UTC)
- Run date (UTC): `2026-04-02`
- Executor: `agent`
- Commands:
  - `cd 03_Implement && npm run release:gate:full`
  - `python3 -m unittest 03_Implement/tools/test_release_gate_check.py 03_Implement/tools/test_release_gate_metrics.py`
  - `python3 03_Implement/tools/planning_queue.py`
- Result summary:
  - release gate + metricsを単一npm scriptに統合。
  - CI/manualとローカルの実行導線を揃えた。
  - planning queueはpending/orphanともに0件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
