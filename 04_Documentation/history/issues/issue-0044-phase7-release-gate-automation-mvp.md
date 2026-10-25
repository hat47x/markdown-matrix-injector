# Issue: Phase 7のリリース判定G1・G2を最小限のスクリプトで自動化する

この文書は、Phase 7当時のG1・G2リリース判定の最小自動化と完了判定を残したIssue記録です。検証計画と2026年3月31日の実行証跡は当時の内容であり、現在のリリース判定結果を新たに確認したものではありません。

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: `03_Implement/tools/release_gate_check.py`, `04_Documentation/phase7-release-readiness.md`, `04_Documentation/README.md`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## 当時の実行計画
### 解決方針（当時の提案）
- Phase 7の判定項目G1（planning）とG2（test）を、一つずつ手動で実行する方式から最小限の自動実行へ移し、リリース判定時の確認漏れを減らす。
- `planning_queue`のJSON結果を読み取り、orphan・pendingの状態確認と`npm test`の実行を一つのコマンドにまとめる。

### 受入条件（Acceptance criteria）
- [x] `03_Implement/tools/release_gate_check.py` が追加され、G1（planning）とG2（test）を一括実行できる。
- [x] pending issue許容の有無を `--allow-pending-issues` で切替できる。
- [x] `04_Documentation/phase7-release-readiness.md` に自動ゲート実行手順が反映される。
- [x] `python3 03_Implement/tools/release_gate_check.py` が成功終了する。

### 作業項目（Task breakdown）
- [x] release gate実行スクリプトを実装する。
- [x] phase7ガイドへ自動実行手順を追記する。
- [x] READMEのPhase 7導線に自動実行コマンドを追加する。
- [x] 実行結果をValidation evidenceとして記録する。

### 当時の検証計画（Validation plan）
- `python3 03_Implement/tools/release_gate_check.py`
- `python3 03_Implement/tools/planning_queue.py`

## Validation evidence (実行証跡)
### 2026-03-31 (UTC)
- Run date (UTC): `2026-03-31`
- Executor: `agent`
- Commands:
  - `python3 03_Implement/tools/release_gate_check.py`
  - `python3 03_Implement/tools/planning_queue.py`
- Result summary:
  - G1/G2を自動判定する `release_gate_check.py` を追加。
  - `phase7-release-readiness.md` に自動実行フローを反映。
  - planning queueでpending/orphanが0件であることを確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
