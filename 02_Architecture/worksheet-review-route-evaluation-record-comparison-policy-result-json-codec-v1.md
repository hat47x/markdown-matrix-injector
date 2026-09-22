# Worksheet Review Route Comparison Policy Result JSON Codec v1

## 1. 目的

issue-0183 policy resultをstorage/transport非依存のcanonical JSON artifactへ変換する。

semantic authorityはissue-0183 validatorのまま維持する。

## 2. Canonical JSON

- object key: recursive lexicographic sort。
- array: semantic orderを保持。
- number: finiteのみ。
- whitespaceなし。
- trailing newlineなし。

serializerは必ずissue-0183 result validatorを先に通す。

## 3. Parse modes

normalizing parseはformat差を許容するがsemantic validationを必須とする。

canonical parseはnormalizing parse後に再serializationし、入力textと完全一致しない場合rejectする。

このためpretty JSON、key-order違い、trailing newline、duplicate-key inputはcanonical artifactとして受理しない。

## 4. Directional filename

```text
worksheet-review-route-evaluation-record-comparison-policy-result-
  <left-record-digest-hex>
  -to-
  <right-record-digest-hex>
  .json
```

left/rightをsortせず、comparison方向を保持する。

## 5. No new judgment

codecはpolicy compliance resultを運ぶだけで、better/worse、model quality、provider winner、deployment approvalを追加しない。

## 6. 非責務

- filesystem/database/cloud persistence。
- signature / encryption / trusted timestamp。
- policy/result digest。
- provider execution。
- production routing。
