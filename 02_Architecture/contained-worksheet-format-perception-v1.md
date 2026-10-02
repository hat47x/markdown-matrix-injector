# Contained Worksheet Format Perception v1

## 1. 目的

実sourceからFly-inspired Perceptionまでのprovenance chainを一本化する。

```text
source path context
      |
      v
approved Format Profiles -> matcher prototypes
      |
      v
Contained Cognitive Observation
  - resolve/containment
  - source identity before
  - snapshot reader
  - source identity after
      |
      v
WorksheetFormatSnapshot
      |
      v
existing worksheet matcher
      |
      v
Fly Perception adapter
```

## 2. Reader port

```ts
type WorksheetFormatSnapshotReader =
  (absolutePath: string, sheetName?: string) => XlsxFormatSnapshotResult
```

readerはcontained path解決を行わない。
workflowがcontainment済みabsolute pathだけを渡す。

これによりinjected readerでdependency-free test、default readerで既存SheetJS実装を同じworkflowで扱える。

## 3. Observation payload

Observation payloadは `kind = worksheet-format` と `sheetName` のみ。

以下は入れない。

- cells
- merges
- feature list
- absolute source path
- raw file bytes

snapshotはstable read window内の一時値としてmatcherへ渡す。

## 4. Provenance

Observation provenanceは:

- sourceKind: callerが明示
- sourceDigest: canonical source-file-bytes-v1
- featureVersion: worksheet-format-v6
- sourceProfileId: current source profile id

Fly adapterは既存どおりfeatureVersion / sourceProfileId互換性を再検証する。

## 5. Profile gating

reader実行前に全Format Profileを `formatProfileToWorksheetPrototype` へ通す。
candidateやincompatible feature/source profileはsource I/Oより先に拒否される。

## 6. Classification semantics

本workflowはscoreやthresholdを変更しない。
matched / ambiguous / novelは既存matcherとPerception adapterの結果そのもの。

## 7. Source stability

snapshot readerはissue-0153のpayload readerとして実行する。
read前後source identityが違えばObservationもPerceptionも返さない。

## 8. Default reader

async default APIはdynamic importで既存 `readXlsxFormatSnapshot` を呼ぶ。
snapshot reader本体、SheetJS bridge、fixtureは変更しない。

## 9. Snapshot shape

`WorksheetFormatSnapshot.merges` はoptionalである。
reader portのshape validationは `cells` を必須とし、`merges` は存在する場合だけarrayであることを要求する。

## 10. 非責務

- Format Profile approval
- production Profile store
- Judgment provider
- review envelope生成
- source write
- XLSX reader改修
- matcher tuning
- fill telemetry研究
