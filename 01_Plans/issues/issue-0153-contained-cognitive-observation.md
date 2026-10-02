# Issue: Contained Cognitive Observation builderを実装する

## Meta
- Type: Feature / Provenance integrity
- Status: Done
- Priority: High
- Scope: contained source identity -> CognitiveObservation provenance, stable source read window
- Expected verification level: unit + focused integration

## Traceability
- Related Backlog/Phase: requirements.md Phase 13
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md
- Depends on: issue-0152 Done
- Parallel exclusion: production Workbook loader / plugin / fill telemetry / external-XLSX評価は変更しない

## Problem

CognitiveObservation.provenance.sourceDigestは現状callerが直接指定できる。
Authority側はissue-0152のcanonical source-file-bytes SHA-256を利用するため、認知側にも同じ生成経路を用意しないと、誤ったdigestや別定義のdigestをObservationへ入れられる。

また、digest計算後にsource由来payloadを読み、その間にファイルが変化すると、Observation provenanceとpayloadが異なるsource stateを指す可能性がある。

## Execution Plan

- `experimental/cognitiveSourceObservation.ts` を追加する。
- caller inputから `sourceDigest` を除外する。
- `resolveContainedSourceIdentity` を必ず通してsource identityを生成する。
- stable builderは:
  1. contained source resolve + identity before
  2. callbackでsource-derived payloadを読む
  3. identity afterを再計算
  4. digest / byteLength一致を要求
  5. CognitiveObservationを構築・検証
- sourceが変化した場合は専用errorでfail-closedする。

## Acceptance criteria

- [x] callerがsourceDigestを渡さないinput型を定義する。
- [x] sourceDigestはissue-0152 canonical identityからのみ生成する。
- [x] workspace containmentを既存resolverで強制する。
- [x] source payload readerへcontained resolved pathだけを渡す。
- [x] payload read前後でdigestとbyteLengthを比較する。
- [x] source変化時にObservationを返さずfail-closedする。
- [x] featureVersion / sourceProfileId optional metadataを保持する。
- [x] `assertCognitiveObservation` を生成後に通す。
- [x] reader例外を握り潰さない。
- [x] traversal / outside symlink時はreaderを呼ばない。
- [x] source bytesやabsolute pathをObservation provenanceへ保存しない。
- [x] production runtime / provider / matcher / fill telemetryを変更しない。

## Validation plan

- stable fileからObservationを生成しcanonical digest一致。
- reader receives contained resolved path。
- featureVersion / sourceProfileId preserved。
- traversal / outside symlinkでreader未呼出。
- reader中のsource mutationを検出。
- reader例外をそのまま伝播。
- required observation metadataの空値を拒否。
- returned Observationにresolved absolute path / raw bytesが含まれないことを確認。
- GitHub Actionsの既知runner/resource不足は完了条件にしない。


## Validation evidence

### 2026-09-20 focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- existing `pathResolver` + issue-0152 source identity + Cognitive Contract + new builderを
  `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true`
  でcompile成功。
- real temporary filesを用いたfocused runtime harness: **8/8 pass**。
- 確認内容は次のとおりです。
  - stable sourceからObservationを生成し、canonical source identity digestと一致。
  - payload readerへcontained resolved pathだけを渡す。
  - featureVersion / sourceProfileIdを保持。
  - workspace外traversalでreader未呼出。
  - workspace内symlinkからworkspace外targetへの参照でreader未呼出。
  - payload read中のsource mutationを `SourceChangedDuringCognitiveObservationError` でfail-closed。
  - payload reader例外を握り潰さず伝播。
  -生成後に既存 `assertCognitiveObservation` を通し、空required metadataを拒否。
  - serialized Observationにはabsolute source path / raw source bytesを含めず、sourceDigestだけをprovenanceへ保持。
- caller input型には `sourceDigest` fieldを持たせず、issue-0152 canonical identityからのみ生成。
- production Workbook loader / plugin / matcher / provider invocation / fill telemetry / external-XLSX評価コードは変更していない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
