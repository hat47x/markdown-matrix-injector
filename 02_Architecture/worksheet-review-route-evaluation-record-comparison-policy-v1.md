# Worksheet Review Route Evaluation Record Comparison Change Policy v1

## 1. 目的

issue-0181 comparisonのchange dimensionsを、callerが事前に明示した許可境界へ照合する。

```text
Validated Comparison
       +
Explicit Change Policy
       |
       v
Deterministic Policy Guard
       |
       +-- compliant
       +-- violations[]
```

## 2. Policy is explicit

default policyは持たない。

全dimensionをbooleanで指定する。

`allowedChanges.foo=true` は:
- fooが変わっても許容する。

でありは次のとおりです。
- fooが必ず変わるべき。

ではない。

## 3. Dimensions

### recordIdentity

recordDigest差。
semantic comparisonが全sameでもcontent identity差を検出したいmigration/round-trip用途で使用。

### planDigest / packetDigest / readinessPolicy / planProvider

inference plan側の変化。

### response

stored provider outcome側の変化。

### groundTruth

human final label identityの変化。

### summary / projectionSeparability / reportProvider

report側の変化。

## 4. Label-only constraint

boolean allowedChangesとは別に3値constraintを持つ。

- required
- forbidden
- either

label-only workflowを明示的に検証できる。

## 5. Result validation

resultはcomparisonとpolicyを内包する。

validator:
1. issue-0181 comparison strict validate。
2. policy strict validate。
3. violationsを再計算。
4. stored violationsと完全一致。
5. compliant == violations emptyを確認。

そのためresult単体でpolicy適合の内部整合性を再検証できる。

## 6. Canonical violations

violationは:
- code
- dimension

だけを持つ。

codeでlexicographic sort。
duplicate禁止。

case id / probability / expected routeを複製しない。

詳細はcomparison artifactを参照する。

## 7. Example policies

### exact identity

全allowedChanges=false。
labelOnlyReevaluation=forbidden。

### label-only re-evaluation

許可は次のとおりです。
- recordIdentity
- groundTruth
- summary
- projectionSeparability

禁止は次のとおりです。
- planDigest
- packetDigest
- readinessPolicy
- planProvider
- response
- reportProvider

labelOnlyReevaluation=required。

### same-ground-truth provider rerun

許可は次のとおりです。
- recordIdentity
- response
- summary

必要に応じprojectionSeparabilityは通常同一のため禁止。

groundTruthは禁止。

これはexampleでありlibrary defaultではない。

## 8. No quality judgment

policy complianceはchange-boundary compliance。

metric improvement/degradationやprovider qualityを評価しない。

## 9. 非責務

- statistical significance。
- model ranking。
- better/worse。
- deployment approval。
- provider invocation。
- persistence。
- signature。
- production routing。
