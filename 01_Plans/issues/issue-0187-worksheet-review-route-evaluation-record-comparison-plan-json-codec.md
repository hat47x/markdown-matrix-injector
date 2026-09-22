# Issue: Worksheet review-route comparison plan canonical JSON codecを実装する

## Meta
- Type: Evaluation governance / Portability
- Status: Open
- Priority: High
- Scope: issue-0186 comparison plan canonical JSON serialization / strict parse / transport-neutral artifact descriptor
- Expected verification level: unit + focused runtime
- Production runtime: 変更しない

## Traceability
- Depends on: issue-0186 Done
- Related: issue-0185 Comparison Policy JSON Codec
- Related: issue-0184 Comparison Policy Result JSON Codec
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md

## Problem

issue-0186でpredeclared comparison planのtyped contractとplanDigestは固定したが、外部へ受け渡すcanonical byte representationが未定義。

callerごとのJSON.stringify差を残すと、同一planでもpredeclared artifact bytesが安定しない。

## Decision

`WorksheetReviewRouteEvaluationRecordComparisonPlanV1` 専用canonical JSON codecを追加する。

- semantic authorityはissue-0186 plan validator。
- recursive object-key sort。
- array order保持。
- finite number only。
- whitespace/trailing newlineなし。
- normalizing parseとcanonical parseを分離。
- canonical parseはpretty/key-order/trailing-newline/duplicate-key inputをreject。
- stable filenameはfull planDigest hexを使用。
- filesystem/database/cloud writeは行わない。
- signature/trusted timestampは追加しない。

## Stable filename

```text
worksheet-review-route-evaluation-record-comparison-plan-<64hex>.json
```

## Acceptance criteria

- [ ] codec version/media type constantsを固定。
- [ ] serializer前にissue-0186 validatorを実行。
- [ ] recursive object key sort。
- [ ] array order保持。
- [ ] whitespace/trailing newlineなし。
- [ ] normalizing parseを追加。
- [ ] canonical parseを追加。
- [ ] pretty/key-order/trailing-newline/duplicate-key canonical rejection。
- [ ] semantic tamperをissue-0186 validatorでreject。
- [ ] full planDigest hexをstable filenameへ使用。
- [ ] artifact descriptorはI/Oを行わない。
- [ ] canonical round-tripでdeepEqual。
- [ ] deterministic serialization。
- [ ] source planをmutateしない。
- [ ] signature/persistence/default policy/better-worse/deployment semanticsを追加しない。
- [ ] production runtimeを変更しない。

## Validation plan

- canonical round trip。
- deterministic serialization。
- normalizing pretty parse。
- canonical formatting rejection。
- duplicate-key rejection。
- planDigest tamper rejection。
- stable filename/artifact descriptor。
- immutability。
- strict compile。
