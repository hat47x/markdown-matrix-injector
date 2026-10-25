# Issue: リリース判定の前に古い成果物を削除して実行手順を安定させる

この文書は、Phase 7当時のリリース判定前の成果物整理と実行手順に関する提案・完了判断を残したIssue記録です。cleanup・gate・metricsの順序と2026年4月2日の実行証跡は当時の内容であり、現在の再現性を新たに確認したものではありません。

## Meta
- Type: Refactor
- Status: Done
- Priority: Medium
- Scope: `03_Implement/tools/release_gate_clean.py`, `03_Implement/tools/test_release_gate_clean.py`, `03_Implement/package.json`, `04_Documentation/phase7-release-readiness.md`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## 当時の実行計画
### 解決方針（当時の提案）
- リリース判定（release gate）を実行する前に、以前の実行で残った古い成果物（artifact）を自動で削除する。これにより、一連の処理（full実行）が前回の出力に影響されにくくなるようにする。

### 受入条件（Acceptance criteria）
- [x] `release_gate_clean.py` が追加される。
- [x] cleanup挙動のunit testが追加される。
- [x] `release:gate:full` がcleanup -> gate -> metricsの順で動作する。
- [x] ガイドにcleanup導線が追記される。

### 作業項目（Task breakdown）
- [x] cleanupスクリプトを追加する。
- [x] unittestを追加する。
- [x] npm scriptsを更新する。
- [x] ドキュメントへ反映する。

### 当時の検証計画（Validation plan）
- `python3 -m unittest 03_Implement/tools/test_release_gate_check.py 03_Implement/tools/test_release_gate_metrics.py 03_Implement/tools/test_release_gate_clean.py`
- `cd 03_Implement && npm run release:gate:full`
- `python3 03_Implement/tools/planning_queue.py`

## Validation evidence (実行証跡)
### 2026-04-02 (UTC)
- Run date (UTC): `2026-04-02`
- Executor: `agent`
- Commands:
  - `python3 -m unittest 03_Implement/tools/test_release_gate_check.py 03_Implement/tools/test_release_gate_metrics.py 03_Implement/tools/test_release_gate_clean.py`
  - `cd 03_Implement && npm run release:gate:full`
  - `python3 03_Implement/tools/planning_queue.py`
- Result summary:
  - cleanupスクリプト追加によりstale artifactを除去可能化。
  - release:gate:fullはcleanupを先頭に実行するよう更新。
  - planning queueはpending/orphanともに0件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
