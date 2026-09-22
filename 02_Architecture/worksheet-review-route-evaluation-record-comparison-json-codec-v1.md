# Worksheet Review Route Evaluation Record Comparison JSON Codec v1

## 1. 目的

issue-0181 comparison artifactを、保存先やtransportに依存しないcanonical JSON textへ変換する。

```text
Validated Comparison
      |
      v
Canonical JSON Codec
      |
      +-- content
      +-- mediaType
      +-- directional filename
```

## 2. Semantic authority

semantic authorityはissue-0181 validator。

codecは:
- JSON byte/text representation
- canonical key order
- canonical artifact判定
- filename convention

だけを担当する。

JSON Schemaを第二のsemantic authorityとして追加しない。

## 3. Canonical JSON

object:
- key lexicographic sort。

array:
- issue-0181 artifactのsemantic orderを保持。

number:
- finiteのみ。

format:
- whitespaceなし。
- trailing newlineなし。

## 4. Parse modes

### normalizing parse

human/manual/migration input向け。

format差を許容するが、issue-0181 semantic validationは必須。

### canonical parse

artifact pipeline向け。

parse後のcanonical reserializationと入力textを完全比較する。

差があればreject。

## 5. Duplicate keys

JSON.parse自体はduplicate keyを後勝ちで解決する。

canonical parseでは:
- inputにduplicate keyがある。
- reserializationでは1 keyだけになる。
- input bytesとcanonical bytesが一致しない。

ためcanonical artifactとしてrejectできる。

## 6. Directional filename

```text
worksheet-review-route-evaluation-record-comparison-
  <left-record-digest-hex>
  -to-
  <right-record-digest-hex>
  .json
```

comparisonは方向付きartifactとして扱う。

left/rightをalphabetical sortしない。

## 7. No new digest

comparisonDigestは追加しない。

canonical JSONの同一性確認はserializerで再生成可能。
source recordsはleft/rightRecordDigestで追跡する。

authentication / trusted timestamp / signatureは別Issue。

## 8. 非責務

- filesystem write。
- object storage。
- database。
- signature。
- encryption。
- trusted timestamp。
- provider execution。
- metric interpretation。
- better/worse判定。
- production routing。
