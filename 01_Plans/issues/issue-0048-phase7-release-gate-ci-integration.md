# Issue: Phase 7のリリース判定をCIに組み込む

この文書は、Phase 7当時のリリース判定をCIへ組み込む提案と完了判断を残したIssue記録です。2026年4月2日の実行証跡にはローカル検証結果が記載されていますが、現在のCI動作や当時のPR実行結果を新たに確認したものではありません。

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `.github/workflows/ci.yml`, `04_Documentation/phase7-release-readiness.md`
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 7 Release Readiness & Adoption Scale
- Related ADR/Spec: `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`

## 当時の実行計画
### 解決方針（当時の提案）
- リリース判定（release gate）の確認をローカルでの運用に加えてCIにも組み込み、プルリクエスト（PR）作成時にG1・G2の動作が後退していないか自動で検出できるようにする。

### 受入条件（Acceptance criteria）
- [x] `.github/workflows/ci.yml` に `release-gate` jobが追加される。
- [x] `release-gate` jobで `python3 01_Plans/tools/release_gate_check.py --format json` が実行される。
- [x] Phase 7ガイドにCI連携が追記される。

### 作業項目（Task breakdown）
- [x] CI workflowを更新する。
- [x] 必要なPython/Nodeセットアップをworkflowに追加する。
- [x] Phase 7運用ガイドへCI実行方針を追記する。
- [x] 実行結果をValidation evidenceへ記録する。

### 当時の検証計画（Validation plan）
- `python3 01_Plans/tools/release_gate_check.py --format json`
- `python3 01_Plans/tools/planning_queue.py`
- `python3 -m unittest 01_Plans/tools/test_release_gate_check.py`

## Validation evidence (実行証跡)
### 2026-04-02 (UTC)
- Run date (UTC): `2026-04-02`
- Executor: `agent`
- Commands:
  - `python3 01_Plans/tools/release_gate_check.py --format json`
  - `python3 01_Plans/tools/planning_queue.py`
  - `python3 -m unittest 01_Plans/tools/test_release_gate_check.py`
- Result summary:
  - CIにrelease-gate jobを追加し、PR時に自動実行されるようにした。
  - phase7 guideにCI連携を追記。
  - ローカル検証でrelease gate / planning queue / unittestがすべて成功。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
