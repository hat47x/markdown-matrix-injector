# Issue: Worksheet review-route Judgmentの評価契約を実装する

## Meta
- Type: Evaluation infrastructure
- Status: Done
- Priority: High
- Scope: inspect/routine outcome metrics, conservative fallback metrics, probability quality, exact-state separability diagnostics
- Expected verification level: unit + focused evaluation
- Production runtime: 変更しない

## Traceability
- Depends on: issue-0161 Done
- Depends on: issue-0165 Done
- Related: issue-0166 Contained Jev Review Entrypoint
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md

## Problem

Jev等のproviderをreview-routeに使う場合、単純accuracyだけでは重要な誤りを見落とす。

特に区別すべきなのは:

- expected inspect を routine に落とす under-route
- expected routine を inspect に上げる over-route
- abstained / unsupported / unavailable によるnon-decision
- probability distributionの質
- 現在providerへ渡すstateそのものがラベルを分離できるか

また、既存worksheet evaluationの `expectedReview` はdeterministic signal検出用ラベルであり、inspect/routineの正解ラベルではない。
これをreview-route評価へ流用すると循環・意味混同になる。

## Decision

provider-neutralな評価器を追加する。

入力:
- case id
- provider出力とは独立に付与された expected route
- `ClosedChoiceJudgmentOutcome<WorksheetReviewRouteChoice>`

出力:
- decision coverage
- decision accuracy
- inspect recall
- routine recall
- unsafe routine count/rate
- unnecessary inspect count/rate
- non-decision count/rate
- conservative fallback-to-inspect時のeffective route metrics
- inspect probabilityのbinary Brier score
- mean selected probability
- mean provider confidence
- per-case diagnostics

## Conservative fallback metric

これはruntime policyではなく**評価上のcounterfactual**として定義する。

non-decisionをinspectへfallbackしたと仮定し:
- unsafe routineは増えない
- routine期待caseではextra inspect costとして数える

production workflowへfallback自動化は追加しない。

## Exact-state separability diagnostic

`JevWorksheetReviewRouteState` と independently assigned expected route の組を受ける診断を追加する。

同一exact stateにinspect/routine両ラベルが存在する場合:
- provider/modelの問題ではなくstate projectionの情報不足候補
- そのcorpus上でexact stateだけを入力とするdeterministic classifierの最大到達accuracyを算出可能

これはlive provider品質と分離して扱う。

## Acceptance criteria

- [x] provider-neutral route outcome evaluatorを追加。
- [x] expected inspect -> predicted routineをunsafe routineとして独立計測。
- [x] expected routine -> predicted inspectをunnecessary inspectとして独立計測。
- [x] non-decisionをdecision accuracy分母へ混ぜない。
- [x] decision coverageを別指標で保持。
- [x] conservative fallback-to-inspect counterfactualを別指標で保持。
- [x] inspect probabilityのbinary Brier scoreをdecisionだけから計算。
- [x] provider confidenceをaccuracyと同一視しない。
- [x] mean provider confidenceはdescriptive metricとしてのみ保持。
- [x] malformed/error Judgmentをfail-closed。
- [x] exact-state conflicting-label groupを検出。
- [x] exact-state oracle max accuracyを算出。
- [x] 0 decision / 0 expected classでもNaNを返さない。
- [x] 既存 `expectedReview` をroute labelとして流用しない。
- [x] live Jev call / threshold / production routingを追加しない。

## Validation plan

- all-correct decisions
- unsafe routine
- unnecessary inspect
- abstention/non-decision
- conservative fallback
- Brier score
- missing score / malformed outcome rejection
- no-decision edge
- single-class edge
- exact-state conflicting labels
- exact-state all-separable
- input immutability
- strict compile


## Validation evidence

### 2026-09-20 focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- GitHub上の `worksheetReviewRouteEvaluation.ts` 本体を、公開interface互換stub依存で
  `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true`
  でcompile成功。
- focused runtime validation:
  - 6-case mixed outcome:
    - decision coverage = `0.666667`
    - decision accuracy = `0.5`
    - unsafe routine rate = `0.333333`
    - unnecessary inspect rate = `0.333333`
    - conservative extra inspect rate = `0.666667`
  - probability-quality case:
    - inspect binary Brier score = `0.025`
    - mean selected probability = `0.85`
    - mean provider confidence = `0.75`
    - confidenceとaccuracyを別指標として保持。
  - all non-decision case:
    - decision accuracy / Brier = `null`
    - NaNを返さない。
  - exact-state conflicting-label case:
    - 4 cases / 2 exact-state groups
    - conflicting groups = `1`
    - cases in conflicting group = `3`
    - exact-state oracle max accuracy = `0.75`
- repository test sourceではさらに:
  - single expected class edge。
  - error outcome拒否。
  - provider-confidence欠落拒否。
  - exact-state fully separable case。
  - input immutability。
- `expectedReview` はreview-route labelとして流用していない。
- live Jev call / model threshold / auto fallback / production routingは追加していない。
- conservative fallback-to-inspectはevaluation counterfactualでありruntime policyではない。
- repository dependency treeは現環境に無いためrepository全test suite成功は主張しない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
