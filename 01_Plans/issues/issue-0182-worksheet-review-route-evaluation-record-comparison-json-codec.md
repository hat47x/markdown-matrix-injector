# Issue: Worksheet review-route evaluation record comparison canonical JSON codecを実装する

## Meta
- Type: Evaluation artifact / Portability
- Status: Open
- Priority: High
- Scope: canonical JSON serialization, strict/normalizing parse, stable directional filename, transport-neutral artifact descriptor
- Expected verification level: unit + focused runtime
- Production runtime: 変更しない

## Traceability
- Depends on: issue-0181 Done
- Related: issue-0179 Evaluation Record JSON Codec
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md

## Problem

issue-0181でvalidated record-to-record comparisonをtyped artifactとして生成できるが、外部保存・CI artifact・レビュー受け渡し用のbyte representationが未定義。

callerが任意の `JSON.stringify` / pretty-print / key order / filenameを使うと:
- 同一comparisonでもartifact bytesが不安定。
- canonical artifactと手編集JSONを区別できない。
- 左右recordの比較方向をfilenameから追跡しにくい。
- duplicate-key JSONをcanonical artifactとして誤受理する余地がある。

## Decision

`WorksheetReviewRouteEvaluationRecordComparisonJsonCodecV1` を追加する。

### Canonical serialization

`serializeWorksheetReviewRouteEvaluationRecordComparisonJson(comparison)`:

1. issue-0181 validatorでstrict validation。
2. object keysをrecursive lexicographic sort。
3. array orderはsemantic orderとして保持。
4. finite numberだけ許可。
5. whitespaceなしJSON text。
6. trailing newlineなし。

### Normalizing parse

`parseWorksheetReviewRouteEvaluationRecordComparisonJson(text)`:
- JSON parse。
- issue-0181 validator。
- semantic artifactをcloneして返す。
- pretty JSON / noncanonical key orderは許容。

### Canonical parse

`parseCanonicalWorksheetReviewRouteEvaluationRecordComparisonJson(text)`:
- normalizing parse。
- canonical reserialization。
- input textとcanonical textが完全一致しない場合reject。

これにより:
- pretty JSON
- noncanonical key order
- trailing newline
- duplicate-key JSON

をcanonical artifactとして受理しない。

## Stable directional filename

comparisonはleft/rightの方向を保持する。

```text
worksheet-review-route-evaluation-record-comparison-<left64>-to-<right64>.json
```

- leftRecordDigest / rightRecordDigestのfull 64-hexを使用。
- digest短縮なし。
- left/rightをsortしない。
- A→B と B→A は異なるfilename。

## Artifact descriptor

`prepareWorksheetReviewRouteEvaluationRecordComparisonJsonArtifact` は:
- codecVersion
- mediaType
- fileName
- content

のみを返す。

filesystem/database/cloud writeは行わない。

## No comparison digest

issue-0181 artifactにはcomparisonDigestを新設しない。

理由:
- source linkageはleft/right recordDigestで既に固定。
- canonical bytesはcodecで再生成可能。
- authenticity/signatureは別責務。
- comparison contract自体を変更せずportabilityだけ追加する。

## Acceptance criteria

- [ ] codec version/media type constantsを固定。
- [ ] canonical serializerを追加。
- [ ] serializer前にissue-0181 validatorを実行。
- [ ] recursive object key sort。
- [ ] array orderを保持。
- [ ] whitespace/trailing newlineなし。
- [ ] non-finite numberをreject。
- [ ] normalizing parseを追加。
- [ ] canonical parseを追加。
- [ ] canonical parseがpretty JSONをreject。
- [ ] canonical parseがkey-order違いをreject。
- [ ] canonical parseがtrailing newlineをreject。
- [ ] canonical parseがduplicate-key inputをreject。
- [ ] semantic tamperをissue-0181 validatorでreject。
- [ ] stable directional filenameを追加。
- [ ] full left/right digest hexをfilenameへ使用。
- [ ] A→B と B→A のfilenameが異なる。
- [ ] artifact descriptorはI/Oを行わない。
- [ ] canonical round-tripでdeepEqual。
- [ ] deterministic serialization。
- [ ] source comparisonをmutateしない。
- [ ] comparisonDigest / signature / persistenceを追加しない。
- [ ] production runtimeを変更しない。

## Validation plan

- valid canonical round trip。
- deterministic serialization。
- directional stable filename。
- reverse-direction filename difference。
- normalizing pretty JSON parse。
- pretty/noncanonical/trailing-newline canonical rejection。
- duplicate-key canonical rejection。
- unknown field / logical invariant tamper。
- non-finite rejection。
- immutability。
- strict compile。
