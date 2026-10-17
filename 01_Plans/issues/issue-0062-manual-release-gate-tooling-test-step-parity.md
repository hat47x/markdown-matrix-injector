# Issue: 手動リリース判定でもCIと同じ順序で補助ツールをテストする

この文書は、Phase 7当時の手動実行ワークフローとCIの検証手順をそろえる提案と完了判断を残したIssue記録です。2026年4月2日のコマンド実行証跡と、GitHub Actions上の手動起動の観測結果は区別し、現在の動作確認として扱いません。

## Meta
- Type: Test
- Status: Done
- Priority: Medium
- Scope: `.github/workflows/release-gate-manual.yml`, `04_Documentation/phase7-release-readiness.md`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## 当時の実行計画
### 解決方針（当時の提案）
- 手動起動するワークフローにも補助ツールの単体テスト手順を加える。CIと同じく、補助ツールのテスト（tooling test）を先に行い、その後にリリース判定（gate run）を実行する順序にそろえる。

### 受入条件（Acceptance criteria）
- [x] manual workflowに `npm run test:release-gate-tools` stepが追加される。
- [x] 既存のmanual flag入力とartifact uploadを維持する。
- [x] Phase 7ガイドにmanual workflowのtest stepが追記される。

### 作業項目（Task breakdown）
- [x] workflow step追加。
- [x] 文書更新。
- [x] 検証実行と証跡記録。

### 当時の検証計画（Validation plan）
- `cd 03_Implement && npm run test:release-gate-tools`
- `cd 03_Implement && npm run release:gate:full`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
### 2026-04-02 (UTC)
- Run date (UTC): `2026-04-02`
- Executor: `agent`
- Commands:
  - `cd 03_Implement && npm run test:release-gate-tools`
  - `cd 03_Implement && npm run release:gate:full`
  - `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - manual workflowにtooling test stepを追加し、CIと同一順序へ統一。
  - manual flag / artifact uploadの既存仕様を維持。
  - planning queueはpending/orphanともに0件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
