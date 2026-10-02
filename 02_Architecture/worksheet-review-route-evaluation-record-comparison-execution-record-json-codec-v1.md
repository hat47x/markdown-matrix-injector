# Planned Comparison Execution Record JSON Codec v1

## 1. 目的

issue-0188の
`WorksheetReviewRouteEvaluationRecordComparisonExecutionRecordV1`
をstorage/transport非依存のcanonical JSON artifactへ変換する。

## 2. Semantic authority

codec自身はexecution record意味論を再実装しない。

serializer/parserは必ず
`assertWorksheetReviewRouteEvaluationRecordComparisonExecutionRecord`
を通す。

## 3. Canonical JSON

- object key: recursive lexicographic sort。
- array order: preserve。
- whitespace: none。
- trailing newline: none。
- non-finite number: reject。
- undefined: reject。
- non-plain object: reject。

## 4. Two parse modes

### Normalizing parse

valid JSON + valid issue-0188 semanticsならformat差を許容する。

用途は次のとおりです。
- manual input
- migration
- external transport normalization

### Canonical parse

parse後にcanonical serializeし、input textと完全一致を要求する。

拒否は次のとおりです。
- pretty JSON
- key order差
- trailing newline
- duplicate-key JSON text

## 5. Artifact filename

```text
worksheet-review-route-evaluation-record-comparison-execution-<64hex>.json
```

`executionDigest` full hexを使用し短縮しない。

## 6. Security boundary

canonical bytesはsignatureではない。

- authenticity
- trusted timestamp
- append-only persistence

は本Issueの責務外。

## 7. 非責務

- filesystem/database/cloud write。
- signature/MAC。
- provider execution。
- better/worse判定。
- provider ranking。
- deployment approval。
