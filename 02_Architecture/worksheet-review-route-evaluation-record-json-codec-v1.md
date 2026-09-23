# Worksheet Review Route Evaluation Record JSON Codec v1

## 1. 目的

issue-0177 evaluation recordを、storage実装に依存しない安定JSON artifactへ変換する。

```text
Evaluation Record
  |
  | strict validate
  v
Canonical JSON Codec
  |
  +-- canonical JSON text
  +-- media type
  +-- recordDigest-based filename
  |
  v
caller-selected transport/storage
```

## 2. Representation

codec version:

```text
mmi-worksheet-review-route-evaluation-record-json-v1
```

media type:

```text
application/vnd.mmi.worksheet-review-route-evaluation-record+json
```

record内部のschemaVersion/representationは変更しない。

## 3. Canonical JSON

rules:
- object keys: Unicode code-unit lexicographic sort。
- arrays: existing orderを保持。
- finite JSON numbers only。
- string/boolean/nullはそのまま。
- whitespaceなし。
- trailing newlineなし。
- UTF-8で保存可能なJSON string。

canonicalizationはrecordのsemantic fieldを追加・削除しない。

## 4. Two parse modes

### normalizing parse

noncanonical whitespace/key orderを許容するが、parsed recordはissue-0177 validatorを通す。

migration/manual tooling用。

### canonical parse

normalizing parse後にcanonical serializationし、入力とbyte-equivalent text比較。

canonical artifact ingest用。

duplicate keyを含むJSONはJSON.parse自体ではlast-write-winsになるため、canonical reserializationとの完全一致でcanonical artifactから排除する。

## 5. Filename

full `recordDigest` hexを使用する。

short hashは採用しない。

filename自体はauthenticity proofではない。
parse後にrecordDigestを必ずvalidatorで再検証する。

## 6. Artifact descriptor

codecは:
- mediaType
- fileName
- content

を返すだけ。

以下を行わない:
- filesystem write
- database insert
- network upload
- content signing
- timestamping

## 7. Schema authority

JSON Schemaだけでは:
- packetDigest再計算
- groundTruthDigest再計算
- evaluation summary再計算
- projection separability再計算
を表現できない。

したがってsemantic authorityはissue-0177 runtime validator。

## 8. Security

canonical JSONは署名ではない。

同一semantic recordのbyte identityを安定化するだけであり、authenticityは別問題。

将来署名を追加する場合、canonical bytesをsignature inputに利用できる。

## 9. 非責務

- persistent store
- cryptographic signature
- key management
- compression
- encryption
- remote transport
- production routing
