# Issue: Planned comparison execution record canonical JSON codecを実装する

## Meta
- Type: Evaluation governance / Canonical artifact
- Status: Done
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

- [x] codec version / media typeを固定。
- [x] issue-0188 validatorをserializer/parserで再利用。
- [x] deterministic compact canonical JSON。
- [x] recursive object key sort。
- [x] array order保持。
- [x] non-finite number拒否。
- [x] undefined拒否。
- [x] non-plain object拒否。
- [x] normalizing parseはpretty JSONを受理。
- [x] canonical parseはpretty JSONを拒否。
- [x] canonical parseはkey-order違いを拒否。
- [x] canonical parseはtrailing newlineを拒否。
- [x] canonical parseはduplicate-key textを拒否。
- [x] semantically invalid execution recordを拒否。
- [x] filenameへfull 64-hex executionDigestを保持。
- [x] serialization/parseでsource recordをmutateしない。
- [x] signature / timestamp / persistenceを追加しない。
- [x] better-worse / winner / ranking / deployment semanticsを追加しない。

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


## Validation evidence

### 2026-09-22 focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- GitHub branch上のcodec本体と同一実装を、issue-0188 execution record validatorのinterface-compatible stub上で
  `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true`
  でcompile成功。
- focused runtime:
  - compact canonical JSON round-trip。
  - normalizing parseでpretty JSONを受理。
  - canonical parseでpretty JSON / trailing newline / duplicate-key textを3/3 reject。
  - full 64-hex `executionDigest` をstable filenameへ使用。
  - artifact descriptorのcontent/fileName整合。
  - source recordをmutateしない。
- repository test sourceではさらに:
  - actual issue-0188 validatorをsemantic authorityとしてserializer/parserで再利用。
  - noncanonical key order rejection。
  - executionDigest tamper rejection。
  - codec version / media type固定。
- codecはcanonical bytesを定義するだけでsignature / trusted timestamp / persistenceを追加しない。
- better-worse / winner / provider ranking / deployment semanticsを追加していない。
- repository全dependency tree成功は現環境では主張しない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
