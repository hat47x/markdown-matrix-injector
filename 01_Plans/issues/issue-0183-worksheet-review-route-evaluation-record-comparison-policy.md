# Issue: Worksheet review-route evaluation-record comparison change policy guardを実装する

## Meta
- Type: Evaluation governance / CI guard
- Status: Open
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

- [ ] policy schema/version/purposeを固定。
- [ ] allowedChanges全fieldを必須化。
- [ ] hidden/default policyを持たない。
- [ ] labelOnlyReevaluation constraintを3値で固定。
- [ ] unknown policy fieldをreject。
- [ ] non-boolean allowed-change fieldをreject。
- [ ] issue-0181 comparison validatorを再利用。
- [ ] record identity changeを独立検査。
- [ ] planDigest changeを独立検査。
- [ ] packetDigest changeを独立検査。
- [ ] readiness policy changeを独立検査。
- [ ] plan provider changeを独立検査。
- [ ] response changeを独立検査。
- [ ] ground truth changeを独立検査。
- [ ] summary changeを独立検査。
- [ ] projection separability changeを独立検査。
- [ ] report provider changeを独立検査。
- [ ] label-only required/forbidden/eitherを検査。
- [ ] violationsをcanonical sorted uniqueにする。
- [ ] result validatorがcomparison+policyからviolationsを再計算。
- [ ] compliant == violations.length === 0 を強制。
- [ ] identical-only policyを表現できる。
- [ ] label-only re-evaluation policyを表現できる。
- [ ] provider-rerun boundary policyを表現できる。
- [ ] overall score / winner / better-worseを追加しない。
- [ ] source comparison/policyをmutateしない。
- [ ] provider実行 / persistence / production routingを変更しない。

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
