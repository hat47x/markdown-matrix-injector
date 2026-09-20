# Issue: Worksheet review-route evaluation readiness reportを実装する

## Meta
- Type: Evaluation infrastructure / Readiness gate
- Status: Done
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

- [x] corpus summaryをprovider-neutralに算出。
- [x] explicit policyを必須とする。
- [x] hidden/default thresholdを持たない。
- [x] policy unknown field / invalid integerをreject。
- [x] adjudicated case数を計測。
- [x] adjudicated case-family数を計測。
- [x] expected inspect/routine数を計測。
- [x] projection coverageを計測。
- [x] 0 denominatorでNaNを返さない。
- [x] 2+ annotations未adjudicatedを別countで保持。
- [x] minimum adjudicated cases blocker。
- [x] minimum family blocker。
- [x] both route class blocker。
- [x] adjudicated projection missing blocker。
- [x] all-case adjudication blocker。
- [x] seed corpusはnot-readyとなる。
- [x] provider output/model/confidenceを参照しない。
- [x] live provider / production routingを変更しない。

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


## Validation evidence

### 2026-09-20 focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- readiness contractと同一の型・分岐構造を持つfocused TypeScript harnessを
  `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true`
  でcompile成功。
- focused runtime:
  - explicit policyを満たす4-case / 3-family corpusで `ready=true`。
  - case数不足 / family不足 / route片側欠落 / adjudicated projection欠落 / unadjudicated case存在を5つの独立blockerとして検出。
  - empty corpusのadjudication/projection coverageはすべて `0` でNaNなし。
  - minimum 0 / 非整数minimum / boolean型違反 / unknown policy fieldをreject。
- repository test sourceを追加:
  - lifecycle count（0 annotation / 1 annotation / 2+ pending / adjudicated）。
  - adjudication / projection / adjudicated-projection coverage。
  - both-route requirement。
  - seed corpus 12件がlabelを発明せずnot-readyになること。
  - input corpus / policy immutability。
- default sample size / hidden thresholdは追加していない。
- readinessはpolicy適合だけを表し、統計的十分性・provider品質・deployment可否を保証しない。
- live provider / model selection / threshold tuning / production routingは追加していない。
- repository全dependency tree成功は現環境では主張しない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
