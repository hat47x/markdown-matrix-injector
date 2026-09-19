# Issue: external XLSX由来snapshotでfill review telemetryを再評価する

## Meta
- Type: Evaluation / Runtime boundary evidence
- Status: Done
- Priority: High
- Scope: external-XLSX practical corpus, fill telemetry replay, contributor documentation
- Feature contract: `worksheet-format-v6` のまま
- Source profile: `sheetjs-ce-xlsx-0.20.3-fill-v1` のまま
- Production matcher: 変更しない
- Cognitive Contract: 変更しない

## Traceability
- Depends on: issue-0139 Done
- Related: issue-0132 / 0133 external XLSX fixtures
- Related: issue-0135〜0138 Cognitive Assistance Plane
- Evaluation helper: `worksheetFormatFillReviewTelemetry.ts`

## 背景

issue-0139では6列・8列のsynthetic snapshot 20ケースでfill review telemetryを評価した。

高影響reason code:

- fill-supported-acceptance
- fill-supported-disambiguation
- fill-induced-ambiguity
- fill-induced-rejection
- fill-changed-winner
- fill-unavailable-for-discrimination

は有望だったが、synthetic snapshotだけでは採用根拠にならない。

一方、issue-0132 / 0133ではLibreOfficeが最終保存したactual XLSX fixtureを既に保持している。

そこで今回は、

```text
external XLSX bytes
 -> SheetJS reader
 -> WorksheetFormatSnapshot
 -> structure+fill / structure-only paired replay
 -> fill review telemetry
```

までを一続きにする。

## 他レーンとの競合回避

作業開始時のmain:

```text
8bf49cdc989a5e1a0521c61f423dd8acfa6f5a11
```

open PR: 0

他チャットでは以下が既にmainへ統合済み。

- PR #178 / issue-0135: Cognitive Contract
- PR #179 / issue-0136: Fly Perception adapter
- PR #180 / issue-0137: Format Profile v1
- PR #181 / issue-0138: Jev closed-choice Judgment feasibility

本Issueでは次を変更しない。

- `cognitiveContract.ts`
- Fly Perception provider
- Format Profile schema/lifecycle
- Judgment provider contract
- Authority Plane
- production runtime

telemetryをCognitive Contractへ露出する判断も行わない。

## Practical corpus

合計9ケース。

### External snapshotを無加工で使うケース

1. Theme Dark exact — review不要
2. Theme Dark vs Theme Dark/Theme Light Tint — review対象
3. Theme Light Tint vs Theme Dark — review不要
4. RGB Fill exact — review不要
5. Metadata Gapped exact — review不要
6. No Title exact — review不要

### External snapshotからfillだけ除去するケース

7. Theme Dark fill unavailable, dark/light prototypes — review対象
8. Theme Dark fill missing exact — review不要
9. Metadata Gapped fill missing exact — review不要

fill除去以外の:

- merge
- header label
- body cells
- body occupancy
- metadata preamble
- gapped header
- title有無

は外部XLSX readerが作ったsnapshotをそのまま保持する。

## なぜheader textやstructureを人工変更しないのか

今回の目的はissue-0139の全taxonomyを再現することではなく、

> 外部XLSX reader境界を通してもhigh-impact / broad-factの意味分離が保たれるか

を確認することである。

そのため最初のpractical corpusでは、外部fixtureに元から存在する:

- dark / light fill差
- gapped header
- titleなし
- partial occupancy

を優先する。

acceptance crossing / induced ambiguity等の全reason codeは、次の実務fixture追加で段階的に確認する。

## Expected boundary 1: fill-only discrimination

LibreOffice theme fixture:

```text
Theme Dark
Theme Light Tint
```

は同一table structureでfill toneだけが異なる。

Theme Dark observationに対し:

```text
structure only:
  candidates are structurally equivalent
  -> ambiguous

structure + fill:
  dark candidate wins
  -> matched
```

期待telemetry:

```text
fill-supported-disambiguation
```

これはissue-0139のsynthetic fill-only discriminationをactual XLSX由来snapshotへ移す最重要ケース。

## Expected boundary 2: essential unavailable

Theme Dark snapshotのfillToneだけを除去する。

dark/light prototypesは元のexternal snapshotを使う。

期待:

```text
structure only: ambiguous
with fill:      ambiguous
```

telemetry:

```text
fill-unavailable
fill-unavailable-for-discrimination
```

つまり、

> 実XLSX由来候補の識別材料がfillだけなのに、observation側でそのevidenceを取得できない

というreasonを保持する。

## Expected boundary 3: tone disagreement

Theme Light Tint observationにTheme Dark prototype。

structureは同一。

期待:

```text
structure only: matched
with fill:      matched
telemetry: fill-tone-disagreement
high impact: false
```

tone違いだけをreview gateへ昇格させない。

## Expected boundary 4: structure-rich exact cases stay quiet

以下をexact prototypeとして評価する。

- RGB Fill
- Metadata Gapped
- No Title

期待:

```text
matched
telemetry = []
```

Metadata Gappedは:

- metadata preamble
- title merge
- physical header gap

を含む。

No Titleはtitle evidenceを持たない。

これらでもfill telemetryが余計なreasonを作らないことを確認する。

## Expected boundary 5: broad fill unavailable remains noisy

fillだけ除去したexact cases:

- Theme Dark
- Metadata Gapped

はreview不要だが:

```text
fill-unavailable
```

を持つ。

external practical corpusでも、

> fill unavailable = review

とはできないことを再確認する。

## Encoded metrics

9-case corpus:

```text
cases           9
expected review 2
no review       7
```

### decision-impact

```text
precision 1.000000
recall    0.500000
FPR       0
```

### essential unavailable

```text
precision 1.000000
recall    0.500000
FPR       0
```

### high-impact union

```text
precision 1.000000
recall    1.000000
FPR       0
```

### broad fill unavailable

```text
precision 0.333333
recall    0.500000
FPR       0.285714
```

### broad tone disagreement

```text
precision 0
recall    0
FPR       0.142857
```

### all telemetry collapsed

```text
precision 0.400000
recall    1.000000
FPR       0.428571
```

これらはrepository runtime testへ固定する期待値であり、現在環境で実行済みとは記録しない。

## 判断

### 1. External XLSX向け専用telemetry実装を作らない

既存 `evaluateWorksheetFormatFillReviewTelemetry` をそのまま使う。

reader経路固有の別taxonomyは作らない。

### 2. Cognitive Contractへまだ露出しない

issue-0135〜0138でprovider-neutral contractは整ったが、今回のreason codeをCognitiveSignalへ写像する変更は行わない。

理由:

- practical corpusが9ケースと小さい
- high-impact taxonomyの全codeをexternal XLSXで確認していない
- runtime testを現在環境で実行できていない

### 3. Broad availability / disagreementはdiagnostic factのまま

external practical corpusでもnoiseが残る期待。

production review gateにはしない。

### 4. Format Profileへも保存しない

fill telemetryはobserved comparison resultであり、Format Profileのcanonical identity metadataとは分ける。

## Acceptance criteria

- [x] external XLSX base64 fixtureを実readerへ通すtestを追加
- [x] decoded SHA-256を再確認してからreaderへ渡す
- [x] Theme Dark / Theme Light Tintをfill-only discriminationへ使う
- [x] fill unavailable for discriminationをexternal-derived snapshotで評価
- [x] tone disagreementをexternal-derived snapshotで評価
- [x] RGB exactを含める
- [x] Metadata Gapped exactを含める
- [x] No Title exactを含める
- [x] Metadata Gapped fill missingを含める
- [x] broad availabilityのnoise expectationを固定
- [x] high-impact unionのexpectationを固定
- [x] production matcherを変更しない
- [x] source profile / feature versionを変更しない
- [x] Cognitive Contract / Perception / Judgment / Format Profileを変更しない

## Validation status

### 既存の独立証拠

issue-0132 / 0133で既に:

- LibreOffice final XLSX bytes
- SHA-256
- RGB fill
- theme / tint fill
- merge
- gapped header
- title-less structure

をfixture provenanceとして固定済み。

### 今回追加したrepository test

`worksheetFormatFillReviewTelemetryExternalXlsx.test.ts` は実 `readXlsxFormatSnapshot` を呼び出す。

現在の作業環境にはrepositoryの `xlsx@0.20.3` dependency treeがないため、**この場ではruntime passを主張しない**。

GitHub Actionsは既知runner/resource不足のため完了条件にしない。

## 次段階

次に必要なのはtelemetry code追加ではなく、external practical corpusを広げて:

1. fill-supported-acceptance
2. fill-induced-ambiguity
3. fill-induced-rejection
4. fill-changed-winner

を実XLSX由来で確認すること。

そのためには「同じ実務templateでlabel driftやstyle driftを持つ複数external workbook」が必要。

そこまで再現した後、Cognitive Contract側のFly Perception signal provenanceに**deterministic review reason**として添付すべきかをissue-0136以降の契約と照合する。
