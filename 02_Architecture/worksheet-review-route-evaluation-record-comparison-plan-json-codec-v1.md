# Worksheet Review Route Evaluation Record Comparison Plan JSON Codec v1

## 1. 目的

issue-0186 comparison planを、comparison実行前に保存・受け渡しできるcanonical JSON artifactへ変換する。

## 2. Semantic authority

codecはplan semanticsを再実装しない。

serialize / parse前後で
`assertWorksheetReviewRouteEvaluationRecordComparisonPlan`
を使う。

## 3. Canonical representation

- object keyはrecursive lexical sort。
- array orderは保持。
- finite number only。
- compact JSON。
- trailing newlineなし。

normalizing parseはformat差を許容するが、canonical parseは入力textと再serialization結果の完全一致を要求する。

## 4. Filename

`planDigest = sha256:<64hex>` のfull hexを使用。

```text
worksheet-review-route-evaluation-record-comparison-plan-<64hex>.json
```

短縮しない。

## 5. Boundary

- filesystem/database/cloud I/Oなし。
- signature/trusted timestampなし。
- comparison実行なし。
- policy defaultなし。
- better/worse、winner、ranking、deployment approvalなし。
