# Issue: Contained worksheet-format Perception workflowを実装する

## Meta
- Type: Feature / Cognitive perception integration
- Status: Open
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

- [ ] `prepareContainedWorksheetFormatPerceptionWithReader` を追加する。
- [ ] snapshot readerへcontained resolved pathだけを渡す。
- [ ] Observation sourceDigestはissue-0153/0152 canonical identityから生成する。
- [ ] Observation featureVersion / sourceProfileIdはmatcher契約と一致させる。
- [ ] Observation payloadへraw snapshot / cells / featuresを保持しない。
- [ ] approved Format Profilesのみmatcher prototypeへ変換可能。
- [ ] invalid/unapproved Profileはreader実行前に拒否する。
- [ ] matched / ambiguous / novel outcomeを既存matcher semanticsのまま返す。
- [ ] reader中source mutationをfail-closedする。
- [ ] reader exceptionを握り潰さない。
- [ ] traversal / containment failureでreaderを呼ばない。
- [ ] optional `merges` を含む正式WorksheetFormatSnapshot shapeを受理する。
- [ ] default reader版は既存 `readXlsxFormatSnapshot` をdynamic importで利用する。
- [ ] existing snapshot reader / matcher / thresholds / fill telemetryを変更しない。

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
