# Issue: CIのリリース判定前に補助ツールの単体テストを実行する

この文書は、Phase 7当時のCIにおけるリリース判定前の単体テスト実行について、提案と完了判断を残したIssue記録です。2026年4月2日の検証証跡は当時の記録であり、現在のCI実行結果を新たに確認したものではありません。

## Meta
- Type: Test
- Status: Done
- Priority: Medium
- Scope: `03_Implement/package.json`, `.github/workflows/ci.yml`, `04_Documentation/phase7-release-readiness.md`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## 当時の実行計画
### 解決方針（当時の提案）
- リリース判定（release-gate）の本処理を実行する前に、補助ツールの単体テスト（tooling unit tests）をCIの独立した手順として実行する。判定処理を支えるツールの不具合を早い段階で検出できるようにする。

### 受入条件（Acceptance criteria）
- [x] `03_Implement/package.json` にtooling test実行スクリプトが追加される。
- [x] CI release-gate jobが `npm run test:release-gate-tools` を実行する。
- [x] Phase 7ガイドにtest stepが反映される。

### 作業項目（Task breakdown）
- [x] npm script追加。
- [x] CI step追加。
- [x] ドキュメント更新。
- [x] 検証実行と証跡記録。

### 当時の検証計画（Validation plan）
- `cd 03_Implement && npm run test:release-gate-tools`
- `cd 03_Implement && npm run release:gate:full`
- `python3 03_Implement/tools/planning_queue.py`

## Validation evidence (実行証跡)
### 2026-04-02 (UTC)
- Run date (UTC): `2026-04-02`
- Executor: `agent`
- Commands:
  - `cd 03_Implement && npm run test:release-gate-tools`
  - `cd 03_Implement && npm run release:gate:full`
  - `python3 03_Implement/tools/planning_queue.py`
- Result summary:
  - release-gate toolingテストをnpm script化。
  - CI release-gate jobがtooling test -> full gateの順で実行するよう更新。
  - planning queueはpending/orphanともに0件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
