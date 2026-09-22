# Issue: Planned comparison execution record canonical JSON codecを実装する

## Meta
- Type: Evaluation governance / Canonical artifact
- Status: Open
- Priority: High
- Scope: issue-0188 execution record canonical JSON serialization, parsing, artifact descriptor
- Expected verification level: unit + focused compile/runtime
- Production runtime: 変更しない

## Traceability
- Depends on: issue-0188 Done
- Related: issue-0187 Comparison Plan JSON Codec
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md

## Problem

issue-0188でplanned comparison executionをimmutable typed recordへ固定できるが、
storage/transport境界でcanonical bytesを固定するcodecがまだない。

既存0179/0182/0184/0185/0187と同じ規約へ揃えないと、
pretty-print・key order・trailing newline・duplicate key等の表現差を
artifact identityと混同する余地がある。

## Decision

`WorksheetReviewRouteEvaluationRecordComparisonExecutionRecordJsonCodecV1`
を追加する。

- serializerは0188 validatorをsemantic authorityとして先に通す。
- recursive object-key sort。
- array order保持。
- compact JSON。
- trailing newlineなし。
- normalizing parseはformat差を許容。
- canonical parseはinput textと再serializationの完全一致を要求。
- stable filenameはfull `executionDigest` hexを使用。

## Artifact descriptor

- codecVersion
- mediaType
- fileName
- content

filesystem/database/cloud writeは行わない。

## Acceptance criteria

- [ ] codec version / media typeを固定。
- [ ] issue-0188 validatorをserializer/parserで再利用。
- [ ] deterministic compact canonical JSON。
- [ ] recursive object key sort。
- [ ] array order保持。
- [ ] non-finite number拒否。
- [ ] undefined拒否。
- [ ] non-plain object拒否。
- [ ] normalizing parseはpretty JSONを受理。
- [ ] canonical parseはpretty JSONを拒否。
- [ ] canonical parseはkey-order違いを拒否。
- [ ] canonical parseはtrailing newlineを拒否。
- [ ] canonical parseはduplicate-key textを拒否。
- [ ] semantically invalid execution recordを拒否。
- [ ] filenameへfull 64-hex executionDigestを保持。
- [ ] serialization/parseでsource recordをmutateしない。
- [ ] signature / timestamp / persistenceを追加しない。
- [ ] better-worse / winner / ranking / deployment semanticsを追加しない。

## Validation plan

- deterministic round-trip。
- pretty JSON normalize/canonical split。
- noncanonical key order。
- trailing newline。
- duplicate key。
- semantic digest tamper。
- stable full-digest filename。
- immutability。
- strict compile。
