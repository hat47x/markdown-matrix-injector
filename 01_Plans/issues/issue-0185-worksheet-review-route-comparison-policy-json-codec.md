# Issue: Worksheet review-route comparison policy canonical JSON codecを実装する

## Meta
- Type: Evaluation governance / Portability
- Status: Open
- Priority: High
- Scope: predeclared comparison policy canonical JSON serialization / strict parse / transport-neutral artifact descriptor
- Expected verification level: unit + focused runtime
- Production runtime: 変更しない

## Traceability
- Depends on: issue-0183 Done
- Related: issue-0184 Comparison Policy Result JSON Codec
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md

## Problem

issue-0183でcomparison change policyをcallerが事前明示できるが、policy単体のcanonical byte representationがない。

result生成後にpolicyを同梱するissue-0184だけでは、評価前に固定したpolicy artifactと評価後resultを別々に保存・照合する運用を標準化できない。

## Decision

`WorksheetReviewRouteEvaluationRecordComparisonPolicyV1` 専用canonical JSON codecを追加する。

- semantic authorityはissue-0183 policy validator。
- recursive object-key sort。
- array order保持。
- finite numberのみ。
- whitespace/trailing newlineなし。
- normalizing parseとcanonical parseを分離。
- canonical parseはpretty/key-order/trailing-newline/duplicate-key inputをreject。
- filenameは固定のtransport-neutral名称とし、policy digest/signatureを新設しない。
- filesystem/database/cloud writeは行わない。
- policy resultやcomparisonを生成しない。

## Acceptance criteria

- [ ] codec version/media type constantsを固定。
- [ ] serializer前にissue-0183 policy validatorを実行。
- [ ] recursive object key sort。
- [ ] array order保持。
- [ ] whitespace/trailing newlineなし。
- [ ] normalizing parseを追加。
- [ ] canonical parseを追加。
- [ ] pretty/key-order/trailing-newline/duplicate-key canonical rejection。
- [ ] semantic tamperをissue-0183 validatorでreject。
- [ ] stable fixed filenameを追加。
- [ ] artifact descriptorはI/Oを行わない。
- [ ] canonical round-tripでdeepEqual。
- [ ] deterministic serialization。
- [ ] source policyをmutateしない。
- [ ] policy digest/signature/persistenceを追加しない。
- [ ] default policy / better-worse / provider ranking / deployment semanticsを追加しない。
- [ ] production runtimeを変更しない。

## Validation plan

- canonical round trip。
- deterministic serialization。
- normalizing pretty parse。
- canonical formatting rejection。
- duplicate-key rejection。
- policy invariant tamper。
- stable filename/artifact descriptor。
- immutability。
- strict compile。
