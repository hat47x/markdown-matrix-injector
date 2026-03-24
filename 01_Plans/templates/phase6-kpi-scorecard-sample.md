# Phase 6 KPI Scorecard Sample

`phase6-kpi-scorecard.md` の記入例。issue-0016〜0019 を1件で横断評価する。

### Scorecard-20260324-001
- **測定日**: 2026-03-24
- **対象文書**: `04_Documentation/README.md`（導線）、`04_Documentation/tutorial.md`（初回成功）、`04_Documentation/scenario-sier-design-docs.md`（意思決定）、`04_Documentation/reference.md`（一次回答）

| KPI | 実測・観測結果 | 判定 (Pass/Watch/Fail) | 根拠メモ |
|---|---|---|---|
| TFS | 29分 | Pass | issue-0016 の 30分成功導線に沿って初回埋め込み成功を確認 |
| Decision Readiness | 3/3 | Pass | issue-0017 の比較観点・適用条件・制約を確認 |
| Support Deflection | 81% | Pass | issue-0018 の Reference で代表問い合わせの一次回答を自己完結 |
| Feedback Closure | 100% | Pass | issue-0019 の分類運用で指摘 6/6 件を反映先へ接続 |

- **判定**: `Pass`
- **次アクション**:
  1. Support Deflection の母数を増やし、週次で再測定する。
  2. Decision Readiness の根拠リンクを scenario 側で節単位アンカー化する。
- **反映先リンク**:
  - requirements: `00_Prompt/requirements.md`
  - architecture: `02_Architecture/phase6-public-documentation-architecture.md`
  - tests: `03_Implement/test/phase6-doc-audit-checklist.md`
  - issue:
    - `01_Plans/issues/issue-0016-phase6-adoption-fast-path.md`
    - `01_Plans/issues/issue-0017-phase6-scenario-roi-proof.md`
    - `01_Plans/issues/issue-0018-phase6-reference-trustworthiness.md`
    - `01_Plans/issues/issue-0019-phase6-feedback-loop-operations.md`
