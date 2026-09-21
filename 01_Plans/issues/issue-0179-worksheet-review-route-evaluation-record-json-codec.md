# Issue: Worksheet review-route evaluation record canonical JSON codecを実装する

## Meta
- Type: Evaluation artifact / Portability
- Status: Open
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

- [ ] codec version/media type constantsを固定。
- [ ] canonical serializerを追加。
- [ ] recursive object key sort。
- [ ] array orderを保持。
- [ ] whitespace/trailing newlineなし。
- [ ] non-finite numberをreject。
- [ ] serializer前にissue-0177 validatorを実行。
- [ ] normalizing parseを追加。
- [ ] canonical parseを追加。
- [ ] canonical parseがpretty JSONをreject。
- [ ] canonical parseがkey-order違いをreject。
- [ ] canonical parseがtrailing newlineをreject。
- [ ] canonical parseがduplicate-key inputをreject。
- [ ] semantic tamperをparse時にissue-0177 validatorでreject。
- [ ] full recordDigest hexを使うstable filename。
- [ ] artifact descriptorはI/Oを行わない。
- [ ] serialize/parseでsource recordをmutateしない。
- [ ] canonical round-tripでdeepEqual。
- [ ]同一recordのserializationがdeterministic。
- [ ] filesystem/database/cloud persistenceを追加しない。
- [ ] authentication signatureと混同しない。

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
