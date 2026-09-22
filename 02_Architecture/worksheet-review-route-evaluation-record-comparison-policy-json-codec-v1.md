# Worksheet Review Route Comparison Policy JSON Codec v1

## 1. 目的

issue-0183のcomparison policyを、comparison/result生成前に固定できるcanonical JSON artifactへ変換する。

```text
Explicit Comparison Policy
        |
        v
Canonical Policy JSON
        |
        + Evaluation Record Comparison
        v
issue-0183 Policy Result
        |
        v
issue-0184 Canonical Result JSON
```

policy artifactとresult artifactを分離することで、「どのchange boundaryを事前に宣言したか」をresult生成後の同梱policyだけに依存せず保持できる。

## 2. Semantic authority

codecはpolicy semanticsを再実装しない。

serialize / parseの前後で `assertWorksheetReviewRouteEvaluationRecordComparisonPolicy` を使う。

## 3. Canonical bytes

- object key: recursive lexical sort。
- array: order保持。
- finite number only。
- whitespaceなし。
- trailing newlineなし。
- UTF-8 JSON textを想定。

canonical parseは入力textと再serialization結果の完全一致を要求する。

そのためpretty JSON、key-order差、trailing newline、duplicate key textはcanonical artifactとしてrejectする。

## 4. Filename

policyにはissue-0177 recordDigestのようなcontent identity digestを追加しない。

filenameは固定:
`worksheet-review-route-evaluation-record-comparison-policy.json`

複数policyのstorage naming/versioningはcodec責務外。

## 5. Boundary

このcodecは:
- policy defaultを決めない。
- policy digest/signatureを追加しない。
- comparison/resultを生成しない。
- filesystem/database/cloudへ書かない。
- better/worse、provider ranking、deployment approvalを意味しない。
