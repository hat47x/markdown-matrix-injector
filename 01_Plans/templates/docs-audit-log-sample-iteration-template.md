# Docs Audit Log Sample Iteration Template

> 用途: docs audit 運用を開始する際の「1回分サンプル記録」雛形。必要箇所を更新して利用する。

## 1. Audit Metadata
- Audit ID: `AUDIT-20260328-01`
- 測定日: `2026-03-28`
- Auditor: `MMI Execution Agent`
- Iteration/Phase: `Phase 6 weekly close`
- 対象文書:
  - `04_Documentation/overview.md`
  - `04_Documentation/quickstart.md`
- Related Issue:
  - `01_Plans/issues/issue-0019-phase6-feedback-loop-operations.md`

## 2. Findings Log（Sample）
| Finding ID | Observation | Evidence | Category | Action |
|---|---|---|---|---|
| F-001 | 前提条件の記載が不足 | quickstart の手順 1 で依存関係未記載 | requirements | requirements に前提条件追記を提案 |
| F-002 | パラメータ説明と設計文書に差異 | overview の mode 説明が architecture と不一致 | architecture | architecture 記述を同期 |
| F-003 | 検証観点の不足 | 失敗系手順が未記載 | test | test 観点追加の issue 起票 |
| F-004 | 利用価値訴求が弱い | FAQ/比較表の導線なし | product gap | scenario / FAQ 補強 |

## 3. Classification Snapshot
- 利用テンプレート: `01_Plans/templates/docs-feedback-classification-template.md`
- 未分類件数: `0`
- 判定: `PASS`
- 反映先リンク:
  - requirements: `00_Prompt/requirements.md`
  - architecture: `02_Architecture/phase6-public-documentation-architecture.md`
  - test: `03_Implement/test/`
  - product gap: `01_Plans/issues/issue-0019-phase6-feedback-loop-operations.md`

## 4. Triage Result
- Command:
  - `python3 01_Plans/tools/planning_queue.py`
- Summary:
  - pending issue: `(record actual)`
  - pending ADR: `(record actual)`
  - orphan issue: `(record actual)`

## 5. Closure
- 完了判定: `Closed`
- 根拠:
  - Gate C の Definition of Done を満たし、未分類件数が 0。
- 次アクション:
  1. scorecard（Gate D）へ KPI を転記。
  2. planning_queue（Gate E）の次回確認日を issue に記録。
