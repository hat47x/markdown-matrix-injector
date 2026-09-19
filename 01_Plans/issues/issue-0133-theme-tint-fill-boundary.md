# Issue: LibreOffice生成XLSXで theme / tint fill の解決境界を固定する

## Meta
- Type: Runtime boundary evaluation
- Status: Done
- Priority: High
- Scope: external theme/tint XLSX fixture, SheetJS theme resolution, bridge classification, source-profile documentation
- Feature contract: `worksheet-format-v6` のまま
- Source profile: `sheetjs-ce-xlsx-0.20.3-fill-v1` のまま
- Production matcher: 変更しない

## Traceability
- Depends on: issue-0132 Done
- Reader: `xlsxFormatSnapshotReader.ts`
- Bridge: `sheetJsWorksheetFormatBridge.ts`
- Adapter: `worksheetFormatFeatureAdapter.ts`
- Source profile: `worksheetFormatPrototype.ts`

## 背景

issue-0132では、LibreOffice Calcが最終保存した外部XLSX fixtureを使い、direct RGB solid fillが:

```text
XLSX
 -> SheetJS cellStyles:true
 -> cell.s.fgColor.rgb
 -> bridge fillTone
 -> header:fill-present / header:dark-fill
 -> source-profile comparison evidence
```

として保持される境界を追加した。

残っていた問いはtheme-indexed colorである。

Excel/Open XMLでは、fill colorは必ずしも `rgb="..."` として保存されない。

たとえば:

```xml
<fgColor theme="3"/>
```

や:

```xml
<fgColor theme="3" tint="0.8"/>
```

のようにworkbook themeとtintで指定できる。

ここでbridgeがtheme XMLを自前で読むべきか、それともSheetJSがread時にRGBへ解決する契約へ依存すべきかを実fixtureで確認する。

## 結論

**bridgeへtheme resolverを追加しない。**

SheetJS CEのstyle-aware read pathは、theme-indexed fillについてtheme color schemeを参照し、tintを適用したRGBをcell styleへ供給する設計になっている。

そのため責務を次のように保つ。

```text
SheetJS reader:
  workbook theme / tint -> resolved rgb

MMI bridge:
  resolved rgb -> dark / gray / light / other

adapter:
  dark / gray / light only -> meaningful fill evidence
```

theme indexだけがありRGBを取得できない異常・未解決ケースでは、bridgeは引き続き `other` とする。

## External fixture

追加fixture:

```text
03_Implement/test/fixtures/
  libreoffice-theme-fill-boundary.xlsx.base64
```

decoded SHA-256:

```text
45d925f4e7d26e5110d05f79a22b2d9b0d67ec73ca8db581cf0a7633d93a4a07
```

生成環境:

```text
LibreOffice 25.2.3.2 520(Build:2)
OpenPyXL 3.1.5
```

生成手順:

1. OpenPyXLでtheme-indexed workbook原型を作成
2. LibreOffice CalcでOffice Open XMLとして再保存
3. 最終XLSXをOpenPyXLとZIP/XMLで独立確認
4. binaryをbase64 textとして固定
5. SHA-256をtestで検証

## Fixture設計

### Sheet: Theme Dark

header fill:

```xml
<fgColor theme="3"/>
```

最終workbook theme:

```text
theme 3 / dark2 = 1F497D
```

この色は現在のcoarse classifierで `dark` になる。

theme resolutionが働かなければbridgeにはRGBがなく `other` になるため、このfixtureはtheme resolutionの有無を判別できる。

### Sheet: Theme Light Tint

header fill:

```xml
<fgColor theme="3" tint="0.8"/>
```

base theme color:

```text
1F497D
```

SheetJS tint algorithm適用後の期待RGB:

```text
C6D9F1
```

これは現在のcoarse classifierで `light` になる。

もしthemeだけ解決してtintを無視すれば `dark` のままなので、このfixtureは**tint適用まで**判別できる。

### Sheet: RGB Control

同じworkbook内にdirect RGB controlを置く。

```text
FF202020 -> dark
```

theme/tint fixture固有の破損と、style-aware reader全体の破損を区別するためである。

## SheetJS raw style contract

testではbridgeへ入る前にSheetJS worksheet objectを直接観測する。

### Theme Dark

期待:

```text
patternType = solid
fgColor.theme = 3
fgColor.tint = 0
fgColor.rgb = 1F497D
```

### Theme Light Tint

期待:

```text
patternType = solid
fgColor.theme = 3
fgColor.tint = 0.8
fgColor.rgb = C6D9F1
```

このraw observationにより、

> bridgeがthemeを解決した

のではなく、

> SheetJS readerがRGBを解決してbridgeへ渡した

ことを責務境界として固定する。

## Bridge unit boundary

`sheetJsWorksheetFormatBridge.test.ts` も更新する。

### unresolved theme

```text
{ theme: 3 }
 -> other
```

bridge単独ではtheme XMLを解決しない。

### resolved theme

```text
{ theme: 3, rgb: 1F497D }
 -> dark
```

### resolved theme + tint

```text
{ theme: 3, tint: 0.8, rgb: C6D9F1 }
 -> light
```

これにより、theme由来であってもRGBが供給された後はdirect RGBと同一の分類規則を使うことが明示される。

## Adapter / source-profile boundary

Theme Dark:

```text
fillTone = dark
 -> header:fill-present
 -> header:dark-fill
```

Theme Light Tint:

```text
fillTone = light
 -> header:fill-present
 -> header:light-fill
```

どちらも `SHEETJS_CE_XLSX_0203_SOURCE_PROFILE` でfill evidenceとして残る。

## なぜtheme resolverをMMIへ追加しないのか

### 1. 責務重複を避ける

XLSX theme XMLの解釈はファイルparserの責務である。

MMI bridgeが同じ解決を実装すると:

- theme scheme ordering
- system color fallback
- tint algorithm
- malformed theme handling

を二重実装することになる。

### 2. library upgrade時の不一致を避ける

SheetJSとMMIが別々にtheme解決を持つと、parser更新時に結果がずれる可能性がある。

### 3. bridgeをinput-shape adapterに限定する

bridgeの責務は:

```text
SheetJS object -> MMI snapshot
```

であり、OOXML parserを再実装しない。

## Fail-closed behavior

theme indexが存在してもresolved RGBが無ければ:

```text
fillTone = other
```

adapterは `other` をmeaningful fill evidenceへ入れない。

したがって:

- theme XML欠落
- unsupported theme representation
- parserがRGB解決できない入力

を推測で補わない。

## Source profile判断

### Profileを維持する

```text
sheetjs-ce-xlsx-0.20.3-fill-v1
evidence = [structure, fill]
```

を維持する。

今回確認するのは既存SheetJS read pathが既に持つtheme resolutionであり、MMI側のevidence種類・feature意味は変わらない。

### Feature versionを上げない

`worksheet-format-v6` を維持する。

追加されるfeatureはなく:

- `header:dark-fill`
- `header:light-fill`

という既存featureへtheme由来RGBが入るだけである。

## Acceptance criteria

- [x] LibreOffice最終保存のtheme-indexed XLSX fixtureを追加
- [x] decoded SHA-256を固定
- [x] theme 3 / dark2が最終theme XMLで `1F497D` であることを独立確認
- [x] `<fgColor theme="3"/>` を最終styles.xmlで確認
- [x] `<fgColor theme="3" tint="0.8"/>` を最終styles.xmlで確認
- [x] raw SheetJS styleでtheme indexを確認するtestを追加
- [x] raw SheetJS styleでresolved RGBを確認するtestを追加
- [x] tint適用後RGB `C6D9F1` を確認するtestを追加
- [x] Theme Darkがbridgeで `dark` になることを固定
- [x] Theme Light Tintがbridgeで `light` になることを固定
- [x] adapterがdark/light fill featureを生成することを固定
- [x] source profile後もfill evidenceが残ることを固定
- [x] unresolved themeはbridge unitで `other` を維持
- [x] MMI側theme resolverを追加しない
- [x] source profile idを変更しない
- [x] feature versionを変更しない
- [x] matcher / thresholdを変更しない

## Validation status

### 実行済み

現在の作業環境で:

- OpenPyXLによるtheme workbook原型生成
- LibreOffice headlessによる最終XLSX再保存
- OpenPyXLによるfinal-file theme / tint readback
- ZIP/XMLでstyles.xml / theme1.xml確認
- decoded fixture SHA-256固定
- SheetJS 0.20.3 source behaviorの確認

を行った。

### Repository SheetJS test

現在の作業環境にはrepositoryの `xlsx@0.20.3` node moduleがinstallされていない。

そのため追加したruntime testのpassはこの場では主張しない。

一方、SheetJS CE 0.20.3の公開sourceでは、`cellStyles` pathでtheme color schemeとtintから `fgColor.rgb` を生成する実装を確認した。

GitHub Actionsは既知のrunner/resource不足があるため完了条件にしない。

## 次段階

theme/tintまで既存reader契約で解決できることが確認できたため、次はstyle種類を増やすより、**実務fixtureでfill evidenceの出現率と識別価値を測る**段階が自然である。

候補:

1. direct RGB / theme / no-fillが実際の設計書でどの比率か
2. fill差だけがformat identityへ寄与するケースがどの程度あるか
3. source profileでfillを持つことがfalse match / false novelへ与える影響
4. fill evidenceを欠くsourceとのcross-profile比較を許すべきか
5. border evidenceを次に保証対象へ進める必要性

実務証拠がないままstyle解析機能を増やさない。
