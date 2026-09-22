# Issue: Worksheet review-route evaluation-record comparison change policy guardを実装する

## Meta
- Type: Evaluation governance / CI guard
- Status: Done
- Priority: High
- Scope: explicit allowed-change policy, deterministic comparison compliance, fail-closed result validation
- Expected verification level: unit + focused runtime
- Production runtime: 変更しない

## Traceability
- Depends on: issue-0181 Done
- Related: issue-0182 Comparison JSON Codec
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md

## Problem

issue-0181は「何が変わったか」をdomain別に分離できるが、CIや監査で:

- label-only re-evaluationではprovider responseを変えてはいけない
- provider rerunではground truthを変えてはいけない
- migration/round-tripではrecord identityまで同一であるべき

といった**期待するchange boundary**をcallerごとに手書きすると、判定ロジックが分散する。

一方、MMI側でbetter/worseやprovider winnerを決めるべきではない。

## Decision

`WorksheetReviewRouteEvaluationRecordComparisonPolicyV1` と
`WorksheetReviewRouteEvaluationRecordComparisonPolicyResultV1` を追加する。

policyは全dimensionを明示指定し、defaultを持たない。

## Policy

```ts
{
  schemaVersion,
  purpose: 'explicit-comparison-change-policy',
  allowedChanges: {
    recordIdentity,
    planDigest,
    packetDigest,
    readinessPolicy,
    planProvider,
    response,
    groundTruth,
    summary,
    projectionSeparability,
    reportProvider
  },
  labelOnlyReevaluation: 'required' | 'forbidden' | 'either'
}
```

boolean:
- `true`: そのdimensionのchangeを許可。
- `false`: changeがあればviolation。

「changeを要求する」意味ではない。

## Result

result:
- schemaVersion
- purpose
- comparison
- policy
- compliant
- violations

comparison自体をsnapshotすることでresult validatorがpolicy適合を再計算できる。

## Violation dimensions

- recordIdentity
- planDigest
- packetDigest
- readinessPolicy
- planProvider
- response
- groundTruth
- summary
- projectionSeparability
- reportProvider
- labelOnlyReevaluation

## Label-only constraint

`labelOnlyReevaluation`:

- `required`: issue-0181 derived factがtrueでなければviolation。
- `forbidden`: trueならviolation。
- `either`:制約なし。

これによりlabel-only correction workflowでは:
- plan / packet / response changeを禁止。
- groundTruth / summary / projectionSeparability / recordIdentity changeを許可。
- labelOnlyReevaluationをrequired。

というpolicyを明示できる。

## No quality judgment

compliantは「callerが事前に明示したchange policyに適合したか」だけを表す。

以下を意味しない:
- model quality。
- better / worse。
- provider superiority。
- deployment readiness。
- production approval。

## Acceptance criteria

- [x] policy schema/version/purposeを固定。
- [x] allowedChanges全fieldを必須化。
- [x] hidden/default policyを持たない。
- [x] labelOnlyReevaluation constraintを3値で固定。
- [x] unknown policy fieldをreject。
- [x] non-boolean allowed-change fieldをreject。
- [x] issue-0181 comparison validatorを再利用。
- [x] record identity changeを独立検査。
- [x] planDigest changeを独立検査。
- [x] packetDigest changeを独立検査。
- [x] readiness policy changeを独立検査。
- [x] plan provider changeを独立検査。
- [x] response changeを独立検査。
- [x] ground truth changeを独立検査。
- [x] summary changeを独立検査。
- [x] projection separability changeを独立検査。
- [x] report provider changeを独立検査。
- [x] label-only required/forbidden/eitherを検査。
- [x] violationsをcanonical sorted uniqueにする。
- [x] result validatorがcomparison+policyからviolationsを再計算。
- [x] compliant == violations.length === 0 を強制。
- [x] identical-only policyを表現できる。
- [x] label-only re-evaluation policyを表現できる。
- [x] provider-rerun boundary policyを表現できる。
- [x] overall score / winner / better-worseを追加しない。
- [x] source comparison/policyをmutateしない。
- [x] provider実行 / persistence / production routingを変更しない。

## Validation plan

- identical comparison + no-change policy。
- label-only comparison + explicit label-only policy。
- label-only comparison + response-forbidden。
- provider rerun + groundTruth-forbidden。
- multiple independent violations。
- label-only required/forbidden/either。
- unknown/missing/non-boolean policy field。
- tampered result violations/compliant。
- canonical violation ordering。
- immutability。
- strict compile。


## Validation evidence

### 2026-09-22 focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- GitHub branch上のpolicy guard sourceと同一実装をissue-0181 comparison interface-compatible validator stub上で
  `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true`
  でcompile成功。
- focused runtime:
  - exact identity comparison + no-change policyでcompliant=true。
  - label-only comparisonは明示的にrecordIdentity / groundTruth / summary / projectionSeparability changeだけを許可し、`labelOnlyReevaluation=required` でcompliant。
  - 同じlabel-only scenarioでresponse changeを混入すると `LABEL_ONLY_REEVALUATION_REQUIRED` と `RESPONSE_CHANGED` を独立violationとして検出。
  - provider rerun policyはresponse / summary changeを許可しつつgroundTruth changeを禁止可能。
  - plan / packet / readiness policy / provider / response / ground truth / summary / projection / report providerの複数changeを10個の独立violationとしてcanonical code orderで返す。
  - tampered resultのviolations/compliantをcomparison+policyから再計算してreject。
- policyにdefaultはなく、allowedChanges全field必須。
- `labelOnlyReevaluation` はrequired / forbidden / eitherの明示3値。
- compliantはcaller-defined change policyへの適合だけであり、model quality / better-worse / deployment判断を意味しない。
- overall score / winner / recommendation / provider rankingは追加していない。
- provider execution / persistence / production routingは変更していない。
- source comparison / policyをmutateしない。
- repository全dependency tree成功は現環境では主張しない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
