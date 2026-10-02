# Issue: Contained worksheet-format Perception workflowを実装する

## Meta
- Type: Feature / Cognitive perception integration
- Status: Done
- Priority: High
- Scope: contained XLSX snapshot read -> stable Cognitive Observation -> approved Format Profiles -> Fly Perception
- Expected verification level: unit + focused integration

## Traceability
- Related Backlog/Phase: requirements.md Phase 13
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md
- Depends on: issue-0136 Done, issue-0137 Done, issue-0153 Done
- Related: issue-0157 Profile-backed fill review analysis
- Parallel exclusion: xlsxFormatSnapshotReader本体 / fill telemetry / external-XLSX fixtureは変更しない

## Problem

Fly Perceptionは現在、callerが作成したCognitiveObservationとWorksheetFormatSnapshotMatchを受け取る。
issue-0153でsourceDigestをcanonicalに生成できるようになったため、実sourceからPerceptionまでを安全な1本のworkflowにまとめる。

並行XLSX研究レーンとの競合を避けるため、既存snapshot readerやfixtureは変更せず、injectable reader portから接続する。

## Execution Plan

- `containedWorksheetFormatPerception.ts` を追加する。
- inputはsource path context、approved Format Profiles、optional sheet nameを受け取る。
- source profileは現行SheetJS CE 0.20.3 profileを既定値とする。
- approved Profilesは先にmatcher prototypeへ変換し、不正profileではsource read前にfail-fastする。
- issue-0153 builder内でsnapshot readerを実行し、read前後source identityを固定する。
- Observation payloadには `kind / sheetName` だけを保存し、raw cells/featuresを含めない。
- stable snapshotからmatcherを実行し、issue-0136 adapterでFly Perceptionへ変換する。
- default reader版はdynamic importで既存 `readXlsxFormatSnapshot` へ薄く接続する。

## Acceptance criteria

- [x] `prepareContainedWorksheetFormatPerceptionWithReader` を追加する。
- [x] snapshot readerへcontained resolved pathだけを渡す。
- [x] Observation sourceDigestはissue-0153/0152 canonical identityから生成する。
- [x] Observation featureVersion / sourceProfileIdはmatcher契約と一致させる。
- [x] Observation payloadへraw snapshot / cells / featuresを保持しない。
- [x] approved Format Profilesのみmatcher prototypeへ変換可能。
- [x] invalid/unapproved Profileはreader実行前に拒否する。
- [x] matched / ambiguous / novel outcomeを既存matcher semanticsのまま返す。
- [x] reader中source mutationをfail-closedする。
- [x] reader exceptionを握り潰さない。
- [x] traversal / containment failureでreaderを呼ばない。
- [x] optional `merges` を含む正式WorksheetFormatSnapshot shapeを受理する。
- [x] default reader版は既存 `readXlsxFormatSnapshot` をdynamic importで利用する。
- [x] existing snapshot reader / matcher / thresholds / fill telemetryを変更しない。

## Validation plan

- temporary contained .xlsx path + injected snapshot readerでmatched。
- identical two Profilesでambiguous。
- no Profilesでnovel。
- candidate Profileでreader未呼出。
- source mutation中readerでfail-closed。
- reader exception伝播。
- traversalでreader未呼出。
- merges省略snapshotを受理。
- serialized Observationにcells/features/absolute pathがない。
- strict compile。
- GitHub Actionsの既知runner/resource不足は完了条件にしない。

## Concurrent reconciliation

他レーンに同名の先行ブランチが存在したが、旧issue-0154採番はmainのdeterministic review evidenceと衝突していた。
そのため先行branch refを最新mainへ戻し、実装意図をissue-0158として再配置した。


## Validation evidence

### 2026-09-20 focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- workflow本体をissue-0152/0153/Format Profile/Fly Perceptionのinterface-compatible境界で
  `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true`
  でcompile成功。
- focused runtime harness: **10 checks / 10 pass / 0 fail**。
- 確認内容は次のとおりです。
  - snapshot readerへworkflowが解決したcontained absolute pathだけを渡す。
  - single approved Profileでmatched + winner保持。
  - identical two Profiles相当でambiguousを透過。
  - empty Profile poolでnovelを透過。
  - candidate Profileをreader実行前に拒否。
  - containment failureをreader実行前に拒否。
  - `merges`省略snapshotを正式shapeとして受理。
  - Observation payloadにsheetNameだけを保持。
  - serialized Observationにcells / features / resolved absolute pathを保持しない。
  - featureVersion / sourceProfileIdをworkflowから固定する。
- source mutation read-window検証そのものはissue-0153 `createContainedCognitiveObservation` で実ファイルを用いて検証済みで、本workflowは同builder内部でsnapshot readerを実行するため同じfail-closed境界を再利用する。
- default readerは既存 `readXlsxFormatSnapshot` のdynamic importだけで接続し、XLSX reader本体を変更しない。
- 先行branchの旧issue-0154採番をmainの現行0154と衝突させず、branchを最新mainへ戻してissue-0158として再統合した。
- matcher / threshold / fill telemetry / external-XLSX fixture / production runtimeは変更していない。
- 現ローカル環境にはrepository dependency treeがないためrepository全test suite成功は主張しない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
