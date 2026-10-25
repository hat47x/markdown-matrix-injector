# Issue: LibreOffice生成XLSXでRGB塗りつぶしの読取境界を確認する

この文書は当時の外部生成XLSXの検証記録である。**fixture**は条件を固定したテスト用ファイル、**direct RGB fill**は色をRGB値で直接指定したセルの塗りつぶし、**source profile**は比較に採用する特徴の範囲を定める設定を指す。LibreOffice再保存ファイルの独立確認と、依存未導入で実行できなかったSheetJS runtime testを区別する。既存Excelとの共存方針や現行の製品受入を変更する記録ではない。

## Meta
- Type: Runtime boundary evaluation
- Status: Done
- Priority: High
- Scope: external-generator XLSX fixture, RGB fill evidence, structural regression, contributor documentation
- Feature contract: `worksheet-format-v6` のまま
- Production matcher: 変更しない

## Traceability
- Depends on: issue-0131 Done
- Reader: `xlsxFormatSnapshotReader.ts`
- Bridge: `sheetJsWorksheetFormatBridge.ts`
- Adapter: `worksheetFormatFeatureAdapter.ts`
- Source profile: `SHEETJS_CE_XLSX_0203_SOURCE_PROFILE`

## 背景

issue-0131では、SheetJS CE 0.20.3自身が生成したXLSX bytesを再読込するruntime testを追加した。

ただしfillについては、

> SheetJS CE writerが任意styleをXLSXへ書けるか

と、

> 外部アプリが生成したXLSXのfillをSheetJS CE readerが読めるか

を同じroundtripで判定しないよう、強いacceptanceから外した。

次に必要なのは、SheetJS以外が最終保存したsmall XLSX fixtureを使い、input-side readerとしてのfill境界を確認することである。

## 今回のfixture

最終XLSXはLibreOffice Calcで再保存した。

生成環境は次のとおりです。

```text
LibreOffice 25.2.3.2 520(Build:2)
OpenPyXL 3.1.5
```

OpenPyXLはfixture原型を作るために使用し、最終バイト列はLibreOffice CalcのXLSX exporterで再保存したものを採用する。

fixture:

```text
03_Implement/test/fixtures/
  libreoffice-rgb-format-boundary.xlsx.base64
```

decoded XLSX SHA-256:

```text
ac561a7f5ca19aeb642fe288a897e036081811274ffd109938215e49e94393e1
```

binaryをGitHub Contents APIで安全に扱えるようbase64 textとして保持する。

test実行時にtemporary `.xlsx` へdecodeする。

## Workbook構成

### Sheet: RGB Fill

```text
External RGB table   [A1:D1 merge]

ID | State | Owner | Note
R-001 | ready | [blank] | memo
R-002 | hold  | A       | memo
```

header fill:

```text
solid
fgColor = FF202020
```

### Sheet: Metadata Gapped

```text
document: external-fixture
owner: libreoffice-roundtrip

    Gapped table              [B3:F3 merge]

B: ID
C: Name
D: [physical gap]
E: State
F: Note
```

header fill:

```text
solid
fgColor = FF404040
```

### Sheet: No Title

title mergeを持たず、row 1を直接headerとする4列表。

header fill:

```text
solid
fgColor = FF202020
```

## 外部generator側の独立確認

LibreOffice再保存後のdecoded fixtureをOpenPyXLで独立に読んで確認した。

### RGB Fill

- merge: `A1:D1`
- `A2`: solid / RGB `FF202020`

### Metadata Gapped

- merge: `B3:F3`
- `B4`: solid / RGB `FF404040`

### No Title

- mergeなし
- `A1`: solid / RGB `FF202020`

これはSheetJS reader testの結果ではなく、fixtureそのものが期待するOOXML/styleを保持していることのprovenance確認である。

## Test 1: direct RGB fill

既存 `readXlsxFormatSnapshot` で `RGB Fill` を読む。

期待は次のとおりです。

- title merge `A1:D1` を保持
- header 4 cellsの `fillTone = dark`
- blank `Owner` cellをinventしない
- adapter:
  - `header:fill-present`
  - `header:dark-fill`
  - `layout:first-body-coverage:partial`
  - `layout:body-majority-occupancy:1101`
- `createWorksheetFormatPrototype(..., SHEETJS_CE_XLSX_0203_SOURCE_PROFILE)` 後も:
  - `header:fill-present`
  - `header:dark-fill`
  を保持

この最後の確認により、direct RGB fillが単にsnapshotへ来るだけでなく、現在のSheetJS source profileで比較evidenceになることを固定する。

## Test 2: metadata + gapped header

期待は次のとおりです。

- header row = 3
- header columns = `[1, 2, 4, 5]`
- title span = 5
- title/header gap = 0
- `layout:5-columns`
- `layout:header-gapped`
- full first-body coverage
- majority occupancy = `1111`
- direct RGB header fill = dark

issue-0131のruntime-generated structural caseを、LibreOffice最終保存fixtureでも再確認する。

## Test 3: title-less table

期待は次のとおりです。

- header row = 0
- title evidenceをinventしない
- 4-column contiguous layout
- body majority occupancy = `1111`
- direct RGB header fill = dark

## Source profile判断

### 維持する

現在のprofile:

```text
sheetjs-ce-xlsx-0.20.3-fill-v1
evidence = [structure, fill]
```

は維持する。

今回の外部生成fixtureにより、少なくとも**direct RGBとして解決可能なsolid fill**については、fill evidenceを保持する設計に実証根拠が増える。

### 拡張しない

今回の結果から、次のような保証まで導くことはできない。

> theme-only colorもすべてdark/gray/lightへ解決できる

bridgeの現在のfill classifierはRGBを直接解決できない場合に保守的に `other` を返す。

adapterは `other` をmeaningful fill evidenceへ含めない。

theme-indexed fillは別fixtureで評価する。

## なぜprofile idを変えないのか

featureの意味やsource evidence集合を変更していないため。

今回行うのは次の2点である。

- 既存 `fill` evidence contractの実証
- 保証範囲の文書上の明確化

この範囲に留まり、次の変更は含まない。

- 新しいfeature追加
- theme resolution追加
- profile evidence集合変更

ではない。

したがって `worksheet-format-v6` と `sheetjs-ce-xlsx-0.20.3-fill-v1` を維持する。

## Acceptance criteria

- [x] SheetJS以外が最終保存したXLSX fixtureを追加
- [x] decoded fixtureのSHA-256を固定
- [x] LibreOffice versionを記録
- [x] external readbackでRGB fill / mergeを独立確認
- [x] RGB Fill sheetでheader dark fillをcontract test化
- [x] blank cellをinventしないことを確認
- [x] fill evidenceがsource profile filtering後も残ることを確認
- [x] metadata preamble + gapped headerを確認
- [x] title-less tableを確認
- [x] source profile idを変更しない
- [x] feature versionを変更しない
- [x] matcher / thresholdを変更しない
- [x] theme fillを推測で保証しない

## Validation status

### Fixture generation / independent inspection

この作業環境で実行済みは次のとおりです。

- LibreOffice headlessによるXLSX再保存
- OpenPyXLによる最終fixture readback
- ZIP/XML containerが有効であることの確認
- SHA-256固定

### Repository SheetJS runtime

現在の作業環境にはrepositoryの `xlsx@0.20.3` node moduleがinstallされていない。

そのため追加したSheetJS runtime testについては、この場でpassを主張しない。

GitHub Actionsも既知のrunner/resource不足があるため完了条件にしない。

PRでは:

- fixture生成・独立検証は実行済み
- SheetJS runtime testはrepository-executableだが現在環境では未実行

を明確に分ける。

## 次段階

次はtheme-indexed fillを独立fixtureで評価する。

確認したいこと。

1. SheetJS CE 0.20.3が `cellStyles:true` でtheme index / tintを `.s` にどう保持するか
2. 現在のbridgeがそれを `other` とすることが実runtimeでも一致するか
3. workbook theme XMLを使ったRGB解決を実装すべきか
4. その解決が必要な実務fixtureの割合
5. theme resolutionを追加する場合、feature/profile versionを上げる必要があるか

theme解決は、必要性と実データ証拠が揃うまでは追加しない。
