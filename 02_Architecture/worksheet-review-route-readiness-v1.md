# Worksheet Review Route Evaluation Readiness v1

## 1. 目的

provider benchmarkの前に、ground-truth corpusの構造的な準備状態を明示する。

これは「Jevを使ってよい」というproduction approvalではない。

## 2. No hidden threshold

readiness関数はdefault sample sizeを持たない。

評価計画側が先にpolicyを固定する。

```ts
{
  minimumAdjudicatedCases,
  minimumAdjudicatedCaseFamilies,
  requireBothExpectedRoutes,
  requireProjectionForAllAdjudicated,
  requireAllCasesAdjudicated
}
```

結果を見てからpolicyを変更した場合は別evaluation runとして扱う。

## 3. Summary vs gate

summaryは事実:
- cases
- annotations
- adjudications
- family coverage
- projection coverage
- route-label counts

gateはpolicyとの比較。

混ぜない。

## 4. Adjudication lifecycle counts

### zeroAnnotationCases
まだ独立labelなし。

### oneAnnotationCases
second annotation待ち。

### multiAnnotationPendingAdjudicationCases
issue-0170のadjudication packetへ進める状態。

### adjudicatedCases
issue-0167 expected routeとして利用可能。

## 5. Projection coverage

projectionStateはlabeler/adjudicatorには見せないが、state separability評価には必要。

- overall projection coverage
- adjudicated projection coverage

を別々に出す。

`requireProjectionForAllAdjudicated=true` の場合のみmissingをblockerにする。

## 6. Route classes

`requireBothExpectedRoutes=true` なら、adjudicated corpusにinspect/routine双方が必要。

これはclass balanceを保証しない。
片側しかない明白な評価不能状態を止めるだけ。

## 7. Case-family coverage

policyのminimumは**adjudicated case families**へ適用する。

未label familyが多くても、final benchmarkに入らないならcoverageへ数えない。

## 8. All-cases requirement

`requireAllCasesAdjudicated` はevaluation design次第。

held-out corpus全体を固定母集団として評価するならtrue。
段階的pilot subsetならfalseを明示する。

## 9. 非責務

- provider execution
- model selection
- sample-size power analysis
- confidence interval
- statistical significance
- threshold tuning
- deployment approval
- production routing
