# Worksheet Review Route Evaluation Record Comparison v1

## 1. 目的

2本のvalidated evaluation recordについて、「何が変わったか」をtrust domainごとに分離して示す。

```text
Record A ─┐
          ├─ strict validate ─> independent comparison dimensions
Record B ─┘
```

## 2. No overall verdict

comparisonは以下を作らない。

- better / worse
- winner
- score
- rank
- recommendation
- deploy / reject decision

評価metric自体はrecord内に存在するが、comparison layerは差の原因domainを識別するだけ。

## 3. Plan dimension

比較:
- planDigest
- packetDigest
- readinessPolicy
- provider descriptor

planDigestはpredeclared inference plan identity。

packetDigestはprovider-visible input identity。

readiness policyとprovider descriptorを別flagでも出すことで、planDigest差の原因を追跡しやすくする。

## 4. Response dimension

stored response全体をcanonical JSON equalityで比較する。

さらにcaseIdごとにoutcome recordを比較し、変更caseだけをsorted listで返す。

これはprovider output changeであり、ground truth changeとは別domain。

## 5. Ground-truth dimension

groundTruthDigestを比較する。

case-levelではreport.caseResultsの:
- id
- expectedRoute

だけを見てroute change case idsを返す。

expectedRoute値そのものはcomparison artifactへ複製しない。

## 6. labelOnlyReevaluation

次をすべて満たす場合だけtrue:

- samePlanDigest
- samePacketDigest
- sameResponse
- differentGroundTruthDigest

これはissue-0177のoffline ground-truth re-evaluationを識別するためのderived fact。

metric improvement/degradationを意味しない。

## 7. Report dimension

比較:
- summary
- projectionSeparability
- provider descriptor

metric deltaをoverall scoreへ集約しない。

## 8. Canonical equality

object:
- key orderを無視。

array:
- semantic orderを保持。

provider capabilities:
- sorted setとして比較。

case-id change list:
- union
- unique
- lexicographic sorted。

## 9. Strict validation boundary

comparison validatorはartifact内部invariantを検証する。

ただしsource recordなしではsame flagの事実性そのものを再計算できない。
したがってsemantic authorityは `compareWorksheetReviewRouteEvaluationRecords`。

将来comparison artifactをpersist/signする場合はsource record digest linkageを使う。

## 10. Non-disclosure

comparison artifactは差分case id以外のrecord detailを複製しない。

特に:
- evidence
- annotations
- adjudication provenance
- worksheet state
- probabilities/confidence
- expectedRoute values
を持たない。

## 11. 非責務

- statistical significance
- causal interpretation
- provider ranking
- deployment approval
- persistent storage
- signature
- provider invocation
- production routing
