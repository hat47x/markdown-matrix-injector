# External XLSX fill telemetry replay

この文書は、synthetic snapshotで設計したfill review telemetryを、LibreOffice生成XLSXからreaderを通したsnapshotへ適用する方法を説明します。

## 1. 目的

確認したいのは新しいscoreではありません。

```text
external XLSX
 -> SheetJS
 -> snapshot
 -> existing fill telemetry
```

という境界を通してもreason codeの意味が保たれるかです。

## 2. 使用fixture

### Theme workbook

- Theme Dark
- Theme Light Tint
- RGB Control

### RGB / structure workbook

- RGB Fill
- Metadata Gapped
- No Title

どちらもLibreOffice Calcが最終保存したXLSXです。

## 3. 無加工ケースを優先する

今回の9ケース中6ケースはreader snapshotをそのまま使います。

これによりは次のとおりです。

- merge
- row gap
- gapped header
- occupancy
- title presence
- resolved theme fill

を実XLSX由来のまま保持します。

## 4. 制御変形はfill除去だけ

3ケースだけsnapshotの `fillTone` を除去します。

目的はは次のとおりです。

> source / reader都合でfill evidenceを取得できない

状況を再現することです。

header label、merge、body、row/column位置は変更しません。

## 5. Theme Dark / Lightの役割

同一structureでfill toneだけが違うため:

```text
structure only
 -> ambiguous

structure + fill
 -> matched
```

という `fill-supported-disambiguation` を外部XLSX由来で確認できます。

## 6. Fill missingの役割

同じ候補群でobservation fillだけ消すと:

```text
structure only -> ambiguous
with fill      -> ambiguous
```

です。

この場合はstatus transitionがありません。

しかしfillが候補識別唯一の材料なので:

```text
fill-unavailable-for-discrimination
```

が必要です。

## 7. Gapped header / No Title

fill telemetryがlayout特殊性へ誤反応しないことを確認します。

exact comparisonならtelemetryは空であるべきです。

## 8. Broad factsは依然として広すぎる

exact structureからfillだけ除去しても `fill-unavailable` は出ます。

これはreview不要ケースです。

したがっては次のとおりです。

```text
fill-unavailable
fill-tone-disagreement
```

はreview flagではなくdiagnostic factです。

## 9. Cognitive Assistance Planeとの境界

現在mainには:

- Cognitive Contract
- Fly Perception adapter
- Format Profile v1
- Judgment feasibility boundary

があります。

今回それらへtelemetryを接続しません。

理由は、deterministic worksheet comparison telemetryの品質を先に確かめるためです。

将来接続する場合もは次のとおりです。

```text
matcher result
fill review reason
cognitive provider signal
```

を同一authorityへ潰さず、provenanceを保つ必要があります。

## 10. 次に必要なfixture

次段階では同じreal-world template familyについて:

- 1/2 label drift
- fill mismatch
- fill missing
- competing prototype

を持つ複数external XLSXを用意し、残りのhigh-impact codeを確認します。
