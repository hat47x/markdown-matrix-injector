# Contained Unified Review Workflow v1

## 1. 目的

同一のstable Worksheet snapshotを、Perceptionとdeterministic reviewの両方へ内部供給する。

```text
contained source
   |
   | stable read window (issue-0153)
   v
Worksheet snapshot (transient, one read)
   |                         |
   |                         +--> issue-0157 deterministic analysis
   v
Fly Perception
   |
optional Judgment factory
   |
Cognitive Review Envelope
   |
issue-0159 proposal/deterministic workflow
   |
UnifiedHumanReviewViewModelV1
```

snapshotはworkflow内部の一時値であり、返却artifactには含めない。

## 2. Fixed source profile

このworkflowは現行 `SHEETJS_CE_XLSX_0203_SOURCE_PROFILE` に固定する。

理由:

- issue-0157 Profile-backed analysisも同profileをprimary pathとして使用する。
- callerがPerceptionだけ別source profileへ切り替える不整合を防ぐ。
- evidence kind / feature versionの対応を単一contractに保つ。

## 3. Profile preflight

source read前に全Profileを `formatProfileToWorksheetPrototype` へ通す。

candidate / incompatible feature version / source profile mismatchはI/O前にfail-closed。

## 4. Stable read

issue-0153 `createContainedCognitiveObservation` を利用する。

snapshot readerはcontained absolute pathだけを受け取る。

read前後source identityが変化した場合:

- Observationを返さない
- Perceptionを返さない
- Judgmentを呼ばない
- Authority loaderを呼ばない

## 5. One transient snapshot

snapshot readerは1回だけ実行する。

同じsnapshot objectを:

- fill-aware matcher
- Profile-backed deterministic analysis

へ使う。

上位callerへsnapshotを返さないため、Perception後に別snapshotへ差し替えるAPIを作らない。

## 6. Optional Judgment

optional `judgmentFactory` は次だけを受け取る。

- Cognitive Observation
- Fly Perception outcome

受け取らない:

- raw worksheet snapshot
- cells
- features
- resolved absolute path
- source bytes

factory結果は `createCognitiveReviewEnvelope` の既存Judgment validationへ委譲する。

## 7. Authority

Authorityはissue-0159 -> issue-0150/0149の既存loader pathを利用する。

snapshot readとAuthority Workbook loadは別目的である。

- snapshot read: Cognitive/Deterministic observation
- Workbook load: executable proposal preview validation

Authority側はsource digestを再確認し、load中変更も既存TOCTOU checkでblockedにする。

## 8. Failure ordering

```text
Profile preflight
 -> source containment / stable snapshot read
 -> Perception
 -> optional Judgment
 -> Envelope
 -> deterministic evidence binding
 -> Authority Workbook load
 -> final projection
```

上流不整合で不要な後続I/Oを行わない。

## 9. 非責務

- source write
- snapshot persistence
- Judgment provider実装
- provider network policy
- UI rendering
- automatic approval
- apply authority
- overall verdict
- matcher tuning
