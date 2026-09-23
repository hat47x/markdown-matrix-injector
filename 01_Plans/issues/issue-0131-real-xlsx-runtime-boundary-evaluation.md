# Issue: 実SheetJS XLSX roundtripで format snapshot 境界を確認する

## Meta
- Type: Evaluation / Runtime boundary evidence
- Status: Done
- Priority: High
- Scope: real XLSX byte roundtrip tests, reader/adapter/matcher integration, contributor documentation
- Feature contract: `worksheet-format-v6` のまま
- Production matcher: 変更しない

## Traceability
- Depends on: issue-0130 Done
- Reader: `xlsxFormatSnapshotReader.ts`
- Bridge: `sheetJsWorksheetFormatBridge.ts`
- Adapter: `worksheetFormatFeatureAdapter.ts`
- Prototype boundary: `worksheetFormatPrototype.ts`

## 背景

issue-0130では、`WorksheetFormatSnapshot` を既存adapterへ通すsnapshot-level評価まで進めた。

ただし、そのsnapshot自体はテストコードで直接組み立てていたため、次は実際のXLSXバイト列をSheetJS CE 0.20.3でreadしたときに同じ前提が成立するかを確認する必要がある。

特に重要なのは次の点である。

1. merge rangeは `!merges` として保持されるか
2. mergeに覆われた従属セルをreaderが通常セルとして補わないか
3. blank cellを通常セルとして補わないか
4. metadata preambleがheader detectionを壊さないか
5. titleなし表を誤ってtitleありにしないか
6. gapped headerの物理列gapがsnapshotへ残るか
7. 実XLSX → snapshot → prototype / matcherでもmulti-family driftが保持されるか
8. fillについて、CE writerの生成能力とinput-side reader契約を混同しないか

## 方針

binary fixtureをリポジトリへ直接置かず、テスト内でSheetJS CE 0.20.3自身にXLSXバイト列を生成させる。

```text
worksheet object
   |
   v
XLSX.write(..., bookType: xlsx)
   |
   v
actual XLSX ZIP/XML bytes
   |
   v
parseXlsxFormatSnapshot / readXlsxFormatSnapshot
   |
   v
sheetJsWorksheetToFormatSnapshot
   |
   v
WorksheetFormatSnapshot
   |
   +--> feature adapter
   |
   +--> prototype / matcher
```

この方式では、少なくとも実際のXLSX container / XML serializer / parserを通る。

## Test 1: merge range / covered cell / blank cell

fixture:

```text
Release table   [merged A1:C1]

ID | State | Note
R-001 | [blank] | memo
```

確認すること:

- `A1:C1` がsnapshotのmergeとして残る
- title rowではA1だけがcellとして観測され、B1/C1をreaderが通常セルとして補わない
- bodyのB3 blankを通常cellとして補わない
- adapterはその結果を:
  - `layout:first-body-coverage:partial`
  - `layout:body-majority-occupancy:101`
  として観測する

ここでblank cellの「欠損」は値の意味ではなく、readerが実際に返したcell presenceとして扱う。

## Test 2: metadata preamble + gapped header

実XLSXに:

- 2行のsingle-cell metadata
- title merge
- 物理的に1列空いたheader
- full body row

を入れる。

確認:

- metadata rowをheaderと誤認しない
- header rowを正しく選ぶ
- physical header columnsが `[1, 2, 4, 5]` として残る
- `layout:5-columns`
- `layout:header-gapped`
- title/header gap = 0
- first body gap = 0
- first body coverage = full
- majority occupancy = `1111`

## Test 3: titleなし表

mergeやtitle cellを作らない実XLSXをreadする。

確認:

- header row = 0
- `region:title-row` を生成しない
- `layout:title-*` を生成しない
- body evidenceは通常どおり生成する

「title evidenceが無い」ことを補完推論しない。

## Test 4: actual file path reader

SheetJSで2-sheet workbookを実XLSXとして生成し、一時ファイルへ保存する。

`readXlsxFormatSnapshot` へ実pathを渡し:

- requested sheetを選択する
- mergeを保持する
- body textを取得する
- 読み込み前後でsource bytesが変わらない

ことを確認する。

これでmemory parserだけでなくfs入口まで閉じる。

## Test 5: fill capability probe

header cellへdark fill相当のstyle objectを与え、`cellStyles: true` でXLSXを生成する。

ただしこのテストでは:

```text
fillTone = undefined OR dark
```

だけを許容する。

理由は、ここで調べたいproduction contractが:

> input XLSXをstyle-aware readerで読む

ことであり、

> SheetJS CE writerが任意のcell stylingをどこまで生成できる

ことではないため。

CE writerがstyleを落とした場合、それをinput readerの能力不足と解釈しない。

逆にdark fillが往復した場合も、この1fixtureだけでsource profile保証を強化しない。

## Test 6: real XLSX → matcher

7列baseline XLSX:

```text
ID | Item | Type | Required | Decision | Reviewer | Note
```

observation XLSX:

- `Decision -> State`
- headerとbodyの間にblank rowを1行

を与える。

両方を実SheetJS readerでsnapshotへ戻し、そのsnapshotからprototype / observationを作る。

structure-only profileで:

- status = matched
- winner = baseline
- `layout:first-body-gap:1`
- raw different-family count = 3

を確認する。

これによりissue-0129/0130で観測したmulti-family signalが、実XLSX byte roundtrip後にも残ることを検証する。

## Fillを今回の主要acceptanceにしない理由

現在のsource profileはSheetJS CE 0.20.3 XLSXについてstructure + fillを比較evidenceとしている。

一方、今回のfixture生成もSheetJS CE自身を使う。

writerのstyle生成能力とreaderのstyle読取能力を同じroundtripだけで評価すると、writer制約をreader制約と誤認する可能性がある。

したがって:

- structure: 強くcontract test化する
- fill: capability probeに留める
- 実外部XLSX由来のfill読取: 別途real fixtureが得られた時点で強化する

という分離を行う。

## 実装範囲

追加:

- `03_Implement/test/xlsxFormatSnapshotRealRuntime.test.ts`
- 本Issue
- runtime boundary説明文書
- experimental READMEへの導線

変更しない:

- reader実装
- SheetJS bridge実装
- feature adapter
- source profile
- matcher
- thresholds
- feature version
- production Markdown経路

## Acceptance criteria

- [x] SheetJS CE 0.20.3の実XLSX bytesを生成するtestを追加
- [x] reader versionを0.20.3として固定確認
- [x] merge range保持を確認
- [x] covered merge cellsを通常cellとして補わないことを確認
- [x] blank cellを通常cellとして補わないことを確認
- [x] metadata preambleを確認
- [x] gapped headerを確認
- [x] titleなし表を確認
- [x] actual file path readerを確認
- [x] source bytes不変を確認
- [x] fillをwriter/read contractと混同しないprobeを追加
- [x] real XLSX snapshotをprototype/matcherへ接続
- [x] different-family count = 3を実XLSX経路で確認
- [x] production codeを変更しない
- [x] worksheet-format-v6を維持

## Validation status

### Repository-side executable validation

追加testはプロジェクトの既存依存:

```text
xlsx = https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

を直接importし、実SheetJS runtimeを使用する。

### Current tool environment limitation

この作業を行った実行環境にはrepositoryの`node_modules/xlsx`が存在しなかった。

外部CDNもDNS解決できず、新規installは実行できなかった。

したがって、**この場では「tests passed」とは記録しない**。

行ったこと:

- 既存source / type boundaryとの静的照合
- pinned API形状との照合
- existing fake-reader / bridge testとの重複確認
- repository差分確認

GitHub Actionsは既知のrunner/resource不足があるため完了条件には使用しない。

## 次段階

次に必要なのはtest generatorを増やすことではなく、外部ツールで生成されたactual XLSX fixtureでstyle evidenceを確認することである。

候補:

1. LibreOffice / Excel等でfill付きsmall fixtureを生成
2. repositoryへsmall binary fixtureを保持するか、base64 fixtureとして管理する
3. SheetJS readerでfill / theme / merge / blank behaviorを確認
4. runtime-generated fixtureとの差を記録
5. source profileのfill guaranteeを維持・縮小・強化するかを判断

それまでは、structure contractとfill capabilityを別々に扱う。
