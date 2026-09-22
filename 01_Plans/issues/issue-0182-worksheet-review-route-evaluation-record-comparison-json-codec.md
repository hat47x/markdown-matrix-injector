# Issue: Worksheet review-route evaluation record comparison canonical JSON codecを実装する

## Meta
- Type: Evaluation artifact / Portability
- Status: Done
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

- [x] codec version/media type constantsを固定。
- [x] canonical serializerを追加。
- [x] serializer前にissue-0181 validatorを実行。
- [x] recursive object key sort。
- [x] array orderを保持。
- [x] whitespace/trailing newlineなし。
- [x] non-finite numberをreject。
- [x] normalizing parseを追加。
- [x] canonical parseを追加。
- [x] canonical parseがpretty JSONをreject。
- [x] canonical parseがkey-order違いをreject。
- [x] canonical parseがtrailing newlineをreject。
- [x] canonical parseがduplicate-key inputをreject。
- [x] semantic tamperをissue-0181 validatorでreject。
- [x] stable directional filenameを追加。
- [x] full left/right digest hexをfilenameへ使用。
- [x] A→B と B→A のfilenameが異なる。
- [x] artifact descriptorはI/Oを行わない。
- [x] canonical round-tripでdeepEqual。
- [x] deterministic serialization。
- [x] source comparisonをmutateしない。
- [x] comparisonDigest / signature / persistenceを追加しない。
- [x] production runtimeを変更しない。

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


## Validation evidence

### 2026-09-22 focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- GitHub branch上のcodec sourceと同一実装をissue-0181 comparison interface-compatible validator stub上で
  `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true`
  でcompile成功。
- focused runtime:
  - canonical serializationはdeterministic。
  - canonical round-tripはsemantic deep-equal。
  - object keyをrecursive canonical sort。
  - array order保持。
  - whitespace / trailing newlineなし。
  - normalizing parseはpretty JSONを受理。
  - canonical parseはpretty JSON / noncanonical key order / trailing newlineをreject。
  - duplicate-key inputはnormalizing parseではJSON semanticsとして解決されるが、canonical parseではinput byte mismatchとしてreject。
  - issue-0181 semantic invariant違反をparse/serialize boundaryでreject。
  - invalid/non-finite semantic valueもissue-0181 validator boundaryでfail-closed。
  - stable filenameはleft/rightのfull 64-hex record digestを保持し、A→BとB→Aで異なる。
  - artifact descriptorはcodecVersion / mediaType / fileName / canonical contentだけを返しI/Oなし。
  - source comparisonをmutateしない。
- comparisonDigest / signature / persistence / cloud writeは追加していない。
- comparison artifactのbetter/worse / winner / recommendation semanticsは追加していない。
- production runtimeは変更していない。
- repository全dependency tree成功は現環境では主張しない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
