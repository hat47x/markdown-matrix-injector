# Issue: Worksheet review-route evaluation record canonical JSON codecを実装する

## Meta
- Type: Evaluation artifact / Portability
- Status: Done
- Priority: High
- Scope: canonical JSON serialization, strict/normalizing parse, stable artifact filename, transport-neutral export descriptor
- Expected verification level: unit + focused runtime
- Production runtime: 変更しない

## Traceability
- Depends on: issue-0177 Done
- Related: issue-0176 Evaluation Plan
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md

## Problem

issue-0177でcompleted evaluation recordのtyped contractとrecordDigestは固定したが、外部へ受け渡すbyte representationが未定義。

単純な `JSON.stringify` を各callerが行うと:
- object key order
- whitespace
- pretty-print
- duplicate JSON keysを含む入力
- filename conventions
がcallerごとに分岐し、同一recordでもartifact bytesが安定しない。

一方、filesystem/database/S3等の永続化先や署名方式をここで決める必要はない。

## Decision

transport-neutralな `WorksheetReviewRouteEvaluationRecordJsonCodecV1` を追加する。

### Canonical serialization

`serializeWorksheetReviewRouteEvaluationRecordJson(record)`:

1. issue-0177 validatorでrecordをstrict validation。
2. object keysをrecursive lexicographic sort。
3. array orderは意味を持つため保持。
4. finite numberだけ許可。
5. whitespaceなしUTF-8 compatible JSON textを返す。
6. trailing newlineを付けない。

### Normalizing parse

`parseWorksheetReviewRouteEvaluationRecordJson(text)`:
- JSON parse。
- issue-0177 strict validation。
- semantic recordをcloneして返す。
- whitespace/key orderは許容。

manual/migration input向け。

### Canonical parse

`parseCanonicalWorksheetReviewRouteEvaluationRecordJson(text)`:
- normalizing parse。
- canonical reserialization。
- input bytes/textがcanonical textと完全一致しない場合reject。

これにより:
- pretty JSON
- noncanonical key order
- trailing whitespace/newline
- duplicate JSON keyを含む入力
をcanonical artifactとして受理しない。

### Artifact descriptor

`prepareWorksheetReviewRouteEvaluationRecordJsonArtifact(record)`:
- mediaType
- fileName
- content

だけを返す。

filesystem writeはしない。

## Stable filename

`recordDigest = sha256:<64 hex>` のfull hexを使用:

```text
worksheet-review-route-evaluation-record-<64hex>.json
```

digest省略・短縮はしない。

## Schema authority

JSON Schemaを第二の正本として新規作成しない。

理由:
- recordはnested CognitiveOutcome / evaluation metrics / provider descriptorを含む。
- runtime validatorはsemantic recomputationまで行う。
- JSON Schemaではsummary再計算・packetDigest再計算等を表現できない。

machine-readable syntax schemaを将来追加しても、semantic authorityはissue-0177 validatorとする。

## Acceptance criteria

- [x] codec version/media type constantsを固定。
- [x] canonical serializerを追加。
- [x] recursive object key sort。
- [x] array orderを保持。
- [x] whitespace/trailing newlineなし。
- [x] non-finite numberをreject。
- [x] serializer前にissue-0177 validatorを実行。
- [x] normalizing parseを追加。
- [x] canonical parseを追加。
- [x] canonical parseがpretty JSONをreject。
- [x] canonical parseがkey-order違いをreject。
- [x] canonical parseがtrailing newlineをreject。
- [x] canonical parseがduplicate-key inputをreject。
- [x] semantic tamperをparse時にissue-0177 validatorでreject。
- [x] full recordDigest hexを使うstable filename。
- [x] artifact descriptorはI/Oを行わない。
- [x] serialize/parseでsource recordをmutateしない。
- [x] canonical round-tripでdeepEqual。
- [x] 同一recordのserializationがdeterministic。
- [x] filesystem/database/cloud persistenceを追加しない。
- [x] authentication signatureと混同しない。

## Validation plan

- valid canonical round trip。
- deterministic serialization。
- stable filename。
- pretty/noncanonical/trailing-newline canonical rejection。
- duplicate top-level key canonical rejection。
- invalid JSON。
- recordDigest/report tamper。
- non-finite rejection。
- immutability。
- strict compile。


## Validation evidence

### 2026-09-21 focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- GitHub branch上のcodec sourceと同一実装をissue-0177 interface-compatible validator stub上で
  `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true`
  でcompile成功。
- focused runtime:
  - canonical object-key sort。
  - array order保持。
  - whitespace / trailing newlineなし。
  - canonical round-trip。
  - normalizing parseはpretty JSON / noncanonical key orderを受理。
  - canonical parseはpretty JSON / key-order違い / trailing newlineをreject。
  - duplicate top-level keyはnormalizing parseではJSON semanticsとして解決されるが、canonical parseではinput byte mismatchとしてreject。
  - invalid JSONをreject。
  - invalid recordDigestをissue-0177 validation boundaryでreject。
  - non-finite numberをreject。
  - full 64-hex recordDigestをstable filenameへ使用。
  - artifact descriptorはcontent / filename / mediaType / codecVersionだけを返しI/Oなし。
  - source recordをmutateしない。
- repository test sourceはactual issue-0174 -> issue-0176 -> issue-0177 completed runからrecordを作成してcodecを検証。
- JSON Schemaはsemantic authorityとせず新規追加していない。issue-0177 runtime validatorが引き続き正本。
- filesystem/database/cloud persistence / signature / encryption / credential / production routingは追加していない。
