# Issue: Worksheet review-route comparison plan canonical JSON codecを実装する

## Meta
- Type: Evaluation governance / Portability
- Status: Done
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

- [x] codec version/media type constantsを固定。
- [x] serializer前にissue-0186 validatorを実行。
- [x] recursive object key sort。
- [x] array order保持。
- [x] whitespace/trailing newlineなし。
- [x] normalizing parseを追加。
- [x] canonical parseを追加。
- [x] pretty/key-order/trailing-newline/duplicate-key canonical rejection。
- [x] semantic tamperをissue-0186 validatorでreject。
- [x] full planDigest hexをstable filenameへ使用。
- [x] artifact descriptorはI/Oを行わない。
- [x] canonical round-tripでdeepEqual。
- [x] deterministic serialization。
- [x] source planをmutateしない。
- [x] signature/persistence/default policy/better-worse/deployment semanticsを追加しない。
- [x] production runtimeを変更しない。

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


## Validation evidence

### 2026-09-22 focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- issue-0186 plan実装とcodec本体を
  `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true`
  でcompile成功。
- focused runtime:
  - deterministic canonical serialization。
  - compact JSON / trailing newlineなし。
  - canonical round-trip deep equality。
  - normalizing parseでpretty JSON受理。
  - canonical parseでpretty JSON reject。
  - planDigest tamperをissue-0186 validatorでreject。
  - full 64-hex planDigestをstable filenameへ使用。
- repository test sourceではさらに:
  - noncanonical key order / trailing newline reject。
  - duplicate-key canonical reject。
  - codec version / media type / artifact descriptor。
  - source plan immutability。
- 初回focused harnessではround-tripを`JSON.stringify`のobject insertion orderで比較して偽陰性となったため、semantic deep equalityへ修正して再実行し成功。codec実装の不具合ではないことを確認。
- filesystem/database/cloud I/O、signature、trusted timestamp、default policy、better/worse、ranking、deployment semanticsは追加していない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
