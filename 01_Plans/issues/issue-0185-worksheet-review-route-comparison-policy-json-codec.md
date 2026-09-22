# Issue: Worksheet review-route comparison policy canonical JSON codecを実装する

## Meta
- Type: Evaluation governance / Portability
- Status: Done
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

- [x] codec version/media type constantsを固定。
- [x] serializer前にissue-0183 policy validatorを実行。
- [x] recursive object key sort。
- [x] array order保持。
- [x] whitespace/trailing newlineなし。
- [x] normalizing parseを追加。
- [x] canonical parseを追加。
- [x] pretty/key-order/trailing-newline/duplicate-key canonical rejection。
- [x] semantic tamperをissue-0183 validatorでreject。
- [x] stable fixed filenameを追加。
- [x] artifact descriptorはI/Oを行わない。
- [x] canonical round-tripでdeepEqual。
- [x] deterministic serialization。
- [x] source policyをmutateしない。
- [x] policy digest/signature/persistenceを追加しない。
- [x] default policy / better-worse / provider ranking / deployment semanticsを追加しない。
- [x] production runtimeを変更しない。

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


## Validation evidence

### 2026-09-22 focused validation

- issue-0183 policy validatorをsemantic authorityとして再利用し、codec側に第二のpolicy判定を追加していないことを確認。
- issue-0184 result codecと同じcanonicalization規則（recursive object-key sort / array order保持 / finite number only / compact JSON / trailing newlineなし）へ整合。
- repository testで以下を固定:
  - deterministic canonical serialization。
  - canonical round-trip。
  - normalizing pretty JSON parse。
  - pretty / noncanonical key order / trailing newline / duplicate-key canonical rejection。
  - invalid `labelOnlyReevaluation` semantic tamper rejection。
  - fixed filename / media type / codec version artifact descriptor。
  - source policy immutability。
- policy単体にはdigest/signatureを新設せず、predeclared bytesとpost-evaluation result artifactの責務を分離。
- filesystem/database/cloud I/O、default policy、better/worse、provider ranking、deployment semantics、production runtime変更は追加していない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
