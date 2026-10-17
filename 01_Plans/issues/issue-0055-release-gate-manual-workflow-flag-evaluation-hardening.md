# Issue: 手動リリース判定で入力オプションの評価方法を見直す

この文書は、Phase 7当時の手動起動ワークフローで入力オプションを扱う方法の改善と完了判断を残したIssue記録です。2026年4月2日の検証証跡は当時の記録であり、現在のGitHub Actionsでの手動起動や動作を新たに確認したものではありません。

## Meta
- Type: Refactor
- Status: Done
- Priority: Medium
- Scope: `.github/workflows/release-gate-manual.yml`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## 当時の実行計画
### 解決方針（当時の提案）
- `workflow_dispatch`から渡す入力値について、GitHubの式展開で条件を判断する方式をやめ、bashの条件分岐で評価する。GitHub式の短絡評価に依存しないようにし、ワークフローの移植性を高める。

### 受入条件（Acceptance criteria）
- [x] manual workflowのoptional flagsがbashの `if` で評価される。
- [x] timeout入力値がenv経由で明示的に渡される。
- [x] 既存artifact uploadフローが維持される。

### 作業項目（Task breakdown）
- [x] inputをenvへマップする。
- [x] `EXTRA_FLAGS` 配列を使った安全な組み立てへ変更する。
- [x] uploadステップの互換性を確認する。

### 当時の検証計画（Validation plan）
- `python3 -m unittest 01_Plans/tools/test_release_gate_check.py`
- `cd 03_Implement && npm run release:gate:artifacts`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
### 2026-04-02 (UTC)
- Run date (UTC): `2026-04-02`
- Executor: `agent`
- Commands:
  - `python3 -m unittest 01_Plans/tools/test_release_gate_check.py`
  - `cd 03_Implement && npm run release:gate:artifacts`
  - `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - manual workflowのフラグ評価をbash条件分岐へ変更。
  - timeout/input値をenv経由で渡す構成に統一。
  - planning queueはpending/orphanともに0件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
