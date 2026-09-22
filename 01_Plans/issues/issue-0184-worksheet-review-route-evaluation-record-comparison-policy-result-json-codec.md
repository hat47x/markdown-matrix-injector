# Issue: Worksheet review-route comparison policy result canonical JSON codecを実装する

## Meta
- Type: Evaluation artifact / Portability
- Status: Open
- Priority: High
- Scope: canonical JSON serialization, strict/normalizing parse, stable directional filename, transport-neutral artifact descriptor
- Expected verification level: unit + focused runtime
- Production runtime: 変更しない

## Traceability
- Depends on: issue-0183 Done
- Related: issue-0182 Comparison JSON Codec
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md

## Problem

issue-0183でcomparison change policy resultをtyped artifactとして生成できるが、CI artifact・監査受け渡し用のcanonical byte representationが未定義。

任意のJSON.stringifyやfilenameをcallerごとに使うと、同じpolicy resultでもartifact bytesが不安定になり、canonical artifactと手編集JSONを区別しにくい。

## Decision

comparison policy result専用canonical JSON codecを追加する。

- semantic authorityはissue-0183 validator。
- recursive object-key sort。
- array order保持。
- finite numberのみ。
- whitespace/trailing newlineなし。
- normalizing parseとcanonical parseを分離。
- canonical parseはpretty/key-order/trailing-newline/duplicate-key inputをreject。
- filenameはleft/right recordDigestのfull hexを保持する方向付き名称。
- filesystem/database/cloud writeは行わない。
- policy/result digestやsignatureは追加しない。

## Acceptance criteria

- [ ] codec version/media type constantsを固定。
- [ ] serializer前にissue-0183 result validatorを実行。
- [ ] recursive object key sort。
- [ ] array order保持。
- [ ] whitespace/trailing newlineなし。
- [ ] normalizing parseを追加。
- [ ] canonical parseを追加。
- [ ] pretty/key-order/trailing-newline/duplicate-key canonical rejection。
- [ ] semantic tamperをissue-0183 validatorでreject。
- [ ] stable directional filenameを追加。
- [ ] full left/right digest hexをfilenameへ使用。
- [ ] A→B と B→A のfilenameが異なる。
- [ ] artifact descriptorはI/Oを行わない。
- [ ] canonical round-tripでdeepEqual。
- [ ] deterministic serialization。
- [ ] source resultをmutateしない。
- [ ] policy/result digest・signature・persistenceを追加しない。
- [ ] better/worse・provider ranking・deployment semanticsを追加しない。
- [ ] production runtimeを変更しない。

## Validation plan

- canonical round trip。
- deterministic serialization。
- normalizing pretty parse。
- canonical formatting rejection。
- duplicate-key rejection。
- policy/result invariant tamper。
- directional filename。
- immutability。
- strict compile。
