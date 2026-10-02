# Worksheet Format Fill Review Analysis v1

## 1. 目的

fill review reasonをruntime evidenceとして利用する経路から、evaluation用ground-truth labelを分離する。

```text
Worksheet snapshots
   -> deterministic fill review analysis
      - telemetry/reasons
      - comparison
      - impact flags
      - NO expectedReview
           |
           +--> DeterministicReviewEvidenceV1
           |
           +--> evaluation wrapper
                 + expectedReview
                 + precision/recall/FPR
```

## 2. Label-free analysis

`WorksheetFormatFillReviewAnalysisResult` はpaired fill-vs-structure comparisonとtelemetry classificationだけを持つ。

含むは次のとおりです。
- withFill / structureOnly
- top confidence delta
- statusChanged
- telemetry
- decisionImpact
- essentialUnavailable
- highImpactReviewTelemetry
- broadFillUnavailable
- broadFillDisagreement

含まないは次のとおりです。
- expectedReview
- precision / recall / falsePositiveRate

## 3. Evaluation wrapper

既存 `evaluateWorksheetFormatFillReviewTelemetry` は公開APIを維持する。

内部ではlabel-free analysisを実行後、入力caseの `expectedReview` を同じidへ後付けしてmetricsを計算する。

これにより既存評価fixtureと研究結果は維持しつつ、runtime artifactが評価ラベル型へ依存しなくなる。

## 4. Taxonomy ownership

`WorksheetFormatFillReviewTelemetryCode` はanalysis moduleを正本とする。

旧telemetry moduleからtype re-exportを行い、既存importを壊さない。

## 5. Deterministic evidence

`createWorksheetFormatDeterministicReviewEvidence` は
`WorksheetFormatFillReviewAnalysisResult` のみを受け取る。

したがってproduction-like review flowでground-truth labelを作る必要がない。

## 6. 非責務

- matcher変更
- threshold変更
- fill extraction変更
- external-XLSX reader変更
- review gate化
- production UI
