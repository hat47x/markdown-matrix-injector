# Issue: Worksheet review-route evaluation readiness reportを実装する

## Meta
- Type: Evaluation infrastructure / Readiness gate
- Status: Open
- Priority: High
- Scope: label/adjudication/projection coverage summary, explicit predeclared readiness policy, structural blockers
- Expected verification level: unit + seed fixture validation
- Production runtime: 変更しない

## Traceability
- Depends on: issue-0167 Done
- Depends on: issue-0168 Done
- Depends on: issue-0170 Done
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md

## Problem

review-route評価器とground-truth workflowは揃ったが、少数・片側routeだけ・projection欠落のcorpusでも数値自体は計算できてしまう。

その状態でlive Jev等を評価すると:
- case数不足
- family偏り
- inspect/routine片側欠落
- projection separability未検証
- annotation/adjudication未完了
を見落としたまま性能値を解釈する危険がある。

## Decision

providerを呼ばないreadiness reportを追加する。

2段階:
1. corpus summary
2. callerが**事前指定するexplicit policy**に対するblocker評価

default thresholdは持たない。

## Summary metrics

- total cases
- total case families
- zero-annotation cases
- one-annotation cases
- multi-annotation pending adjudication cases
- adjudicated cases
- adjudicated case families
- total annotations
- projection-state cases
- adjudicated projection-state cases
- expected inspect/routine counts
- adjudication coverage
- projection coverage
- adjudicated projection coverage

## Explicit readiness policy

caller必須:
- minimumAdjudicatedCases
- minimumAdjudicatedCaseFamilies
- requireBothExpectedRoutes
- requireProjectionForAllAdjudicated
- requireAllCasesAdjudicated

policy自体をstrict validationする。

## Blocker codes

- ADJUDICATED_CASES_BELOW_MINIMUM
- ADJUDICATED_CASE_FAMILIES_BELOW_MINIMUM
- EXPECTED_ROUTE_CLASS_MISSING
- ADJUDICATED_PROJECTION_STATE_MISSING
- UNADJUDICATED_CASES_PRESENT

blockerなしの場合だけ `ready=true`。

## Important boundary

readinessは統計的十分性や外的妥当性を保証しない。

明示policyを満たしたことだけを表す。

provider/model性能評価、threshold選択、deployment判断は別Issue。

## Acceptance criteria

- [ ] corpus summaryをprovider-neutralに算出。
- [ ] explicit policyを必須とする。
- [ ] hidden/default thresholdを持たない。
- [ ] policy unknown field / invalid integerをreject。
- [ ] adjudicated case数を計測。
- [ ] adjudicated case-family数を計測。
- [ ] expected inspect/routine数を計測。
- [ ] projection coverageを計測。
- [ ] 0 denominatorでNaNを返さない。
- [ ] 2+ annotations未adjudicatedを別countで保持。
- [ ] minimum adjudicated cases blocker。
- [ ] minimum family blocker。
- [ ] both route class blocker。
- [ ] adjudicated projection missing blocker。
- [ ] all-case adjudication blocker。
- [ ] seed corpusはnot-readyとなる。
- [ ] provider output/model/confidenceを参照しない。
- [ ] live provider / production routingを変更しない。

## Validation plan

- empty corpus edge。
- seed corpus。
- partial corpus。
- fully-ready corpus。
- missing route class。
- missing projection。
- pending adjudication。
- strict policy validation。
- input immutability。
- strict compile。
