# Issue: Contained Cognitive Observation builderを実装する

## Meta
- Type: Feature / Provenance integrity
- Status: Open
- Priority: High
- Scope: contained source identity -> CognitiveObservation provenance, stable source read window
- Expected verification level: unit + focused integration

## Traceability
- Related Backlog/Phase: requirements.md Phase 13
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md
- Depends on: issue-0152 Done
- Parallel exclusion: production Workbook loader / plugin / fill telemetry / external-XLSX評価は変更しない

## Problem

CognitiveObservation.provenance.sourceDigest は現状callerが直接指定できる。
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

- [ ] callerがsourceDigestを渡さないinput型を定義する。
- [ ] sourceDigestはissue-0152 canonical identityからのみ生成する。
- [ ] workspace containmentを既存resolverで強制する。
- [ ] source payload readerへcontained resolved pathだけを渡す。
- [ ] payload read前後でdigestとbyteLengthを比較する。
- [ ] source変化時にObservationを返さずfail-closedする。
- [ ] featureVersion / sourceProfileId optional metadataを保持する。
- [ ] `assertCognitiveObservation` を生成後に通す。
- [ ] reader例外を握り潰さない。
- [ ] traversal / outside symlink時はreaderを呼ばない。
- [ ] source bytesやabsolute pathをObservation provenanceへ保存しない。
- [ ] production runtime / provider / matcher / fill telemetryを変更しない。

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
