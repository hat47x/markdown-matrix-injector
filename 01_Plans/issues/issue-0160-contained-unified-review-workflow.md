# Issue: contained sourceからUnified Human Reviewまで同一snapshotで一貫生成する

## Meta
- Type: Feature / Safe end-to-end orchestration
- Status: Done
- Priority: High
- Scope: stable contained XLSX snapshot -> Perception -> optional Judgment -> Envelope -> Profile-backed deterministic analysis -> Authority -> UnifiedHumanReviewViewModel
- Expected verification level: focused unit / composition
- Production runtime: 変更しない

## Traceability
- Depends on: issue-0153 Done
- Depends on: issue-0157 Done
- Depends on: issue-0158 Done
- Depends on: issue-0159 Done
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md
- Parallel exclusion: XLSX reader / matcher / provider / production UI は変更しない

## Problem

issue-0158はcontained sourceからstable Observation + Perceptionを生成できる。
issue-0159はobservation snapshot + Envelopeから4-domain review modelを生成できる。

ただし両者の間ではsnapshotをcallerが受け渡す必要があり、次の余地が残る。

- Perception用snapshotとdeterministic analysis用snapshotの取り違え
- sourceを二度snapshot readして別時点を比較
- raw snapshotを上位層へ保持
- source profileの不整合

## Execution Plan

新workflow `prepareContainedUnifiedReviewWithReaderAndLoader` を追加する。

1. approved Format Profilesを現行SheetJS source profileへpreflight。
2. issue-0153 `createContainedCognitiveObservation` のstable read window内でsnapshot readerを1回だけ呼ぶ。
3. そのsnapshotを一時値として保持し、既存matcher + Fly adapterでPerceptionを生成。
4. optional Judgment factoryにはObservation + Perceptionだけを渡す。raw snapshotは渡さない。
5. `createCognitiveReviewEnvelope` を内部生成。
6. **同じsnapshot object** をissue-0159 deterministic workflowへ渡す。
7. Authority loaderを通して最終 `UnifiedHumanReviewViewModelV1` を返す。
8. snapshot / raw cells / featuresは返却しない。

default版は既存XLSX readerとAuthority default loaderをdynamic import経路で利用する。

## Acceptance criteria

- [x] contained source snapshot readerを1回だけ呼ぶ。
- [x] same snapshotをPerceptionとdeterministic analysisへ内部利用する。
- [x] caller inputにobservation snapshotを含めない。
- [x] caller inputにCognitive Review Envelopeを含めない。
- [x] caller inputにsource profileを含めず現行SheetJS profileへ固定する。
- [x] approved Profileをsource I/O前に検証する。
- [x] stable source identityをObservation / Envelope / final view modelへ維持する。
- [x] optional Judgment factoryへraw snapshotを渡さない。
- [x] Judgment factory出力は既存Envelope validatorで再検証する。
- [x] invalid Profile / containment failure / source mutation / Judgment failureでAuthority loaderを呼ばない。
- [x] Authority blockedでも4-domain review modelを生成できる。
- [x] raw Notation / cells / features / WorkbookData / resolved pathを最終modelへ保持しない。
- [x] source/matcher/provider/UI semanticsを変更しない。
- [x] production runtimeへ接続しない。

## Validation plan

- stable contained sourceからsatisfied Unified model。
- snapshot reader exactly once。
- optional Judgment保持。
- invalid Profileでreader/loader未呼出。
- source mutationでloader未呼出。
- Judgment factory failureでloader未呼出。
- invalid proposal parameterでAuthority blockedだがCognitive/Deterministicを保持。
- Notationが別sourceを指す場合source-identity blocked。
- input immutability。
- serialization boundary。
- strict compile。


## Validation evidence

### 2026-09-20 focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- issue-0153 / 0157 / 0159の公開型・関数シグネチャとinterface-compatibleな境界で
  `containedUnifiedReviewWorkflow.ts` を
  `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true`
  でcompile成功。
- workflow-focused runtime harness: **10 checks / 10 pass / 0 fail**。
- 確認内容:
  - contained absolute pathだけをsnapshot readerへ渡す。
  - snapshot reader呼出は1回だけ。
  - Authority Workbook loader呼出は正常table pathで1回。
  - readerが返した**同一snapshot object**をPerception後のdeterministic workflowへ渡す。
  - optional Judgment factoryはObservation + Perceptionだけを受け、raw cells/featuresを受けない。
  - Judgment resultをEnvelope経由で最終modelへ保持。
  - candidate Profileをsnapshot read / Workbook load前にfail-closed。
  - invalid proposal parameterはAuthority blockedとして透過。
- repository focused test sourceには追加で以下を固定:
  - source mutation during snapshot read -> Judgment / Authority loader未呼出。
  - Judgment factory failure -> Authority loader未呼出。
  - Notationが別sourceを指す -> source-identity blocked。
  - caller input / Profile / snapshot不変。
  - final serializationにraw Notation / cells / features / WorkbookData / resolved path / evaluation label / combined score / apply semanticsを保持しない。
- source profileはcaller inputに露出せず、
  `SHEETJS_CE_XLSX_0203_SOURCE_PROFILE` へ固定。
- caller inputにObservation snapshot / prepared Envelopeを持たせないcompile-time guardを追加。
- production XLSX reader / matcher / provider / Authority semantics / UIは変更していない。
- 現ローカル環境にはrepository dependency treeがないためrepository全test suite成功は主張しない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
