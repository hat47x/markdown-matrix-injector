# Issue: Worksheet review-route comparison policy result canonical JSON codecを実装する

## Meta
- Type: Evaluation artifact / Portability
- Status: Done
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

- [x] codec version/media type constantsを固定。
- [x] serializer前にissue-0183 result validatorを実行。
- [x] recursive object key sort。
- [x] array order保持。
- [x] whitespace/trailing newlineなし。
- [x] normalizing parseを追加。
- [x] canonical parseを追加。
- [x] pretty/key-order/trailing-newline/duplicate-key canonical rejection。
- [x] semantic tamperをissue-0183 validatorでreject。
- [x] stable directional filenameを追加。
- [x] full left/right digest hexをfilenameへ使用。
- [x] A→BとB→Aのfilenameが異なる。
- [x] artifact descriptorはI/Oを行わない。
- [x] canonical round-tripでdeepEqual。
- [x] deterministic serialization。
- [x] source resultをmutateしない。
- [x] policy/result digest・signature・persistenceを追加しない。
- [x] better/worse・provider ranking・deployment semanticsを追加しない。
- [x] production runtimeを変更しない。

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


## Validation evidence

### 2026-09-22 focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- GitHub branch上のcodecと同じcanonicalization / parse / filename実装を、issue-0183 policy-result interface-compatible validator stub上で
  `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true`
  でcompile成功。
- focused runtime: **8/8 pass**。
  - deterministic canonical serialization。
  - whitespace/trailing newlineなし。
  - canonical round-trip。
  - normalizing pretty JSON parse。
  - pretty JSON canonical rejection。
  - duplicate-key canonical rejection。
  - left/right full digestを保持するdirectional filename。
  - semantic tamperをvalidator boundaryでreject。
- repository testにはさらにnoncanonical key order、trailing newline、artifact descriptor、source immutability、issue-0183 violations invariant tamperを固定。
- semantic authorityはissue-0183 validatorのまま。codec側に第二のpolicy判定を追加していない。
- policy/result digest / signature / persistence / better-worse / provider ranking / deployment semanticsは追加していない。
- production runtimeは変更していない。
- repository全dependency tree成功は現環境では主張しない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
