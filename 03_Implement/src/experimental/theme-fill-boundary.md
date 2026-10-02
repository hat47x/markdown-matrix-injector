# Theme and tint fill boundary

この文書は、XLSXのtheme-indexed fillをMMIのworksheet-format実験層がどの責務で扱うかを説明します。

## 1. 要点

MMIはworkbook theme XMLを自前で解決しません。

```text
OOXML theme / tint
        |
        v
SheetJS CE 0.20.3
        |
        | resolved fgColor.rgb
        v
MMI SheetJS bridge
        |
        | dark / gray / light / other
        v
worksheet format adapter
```

この分離を維持します。

## 2. theme colorとは

XLSXのfillは直接RGBだけではありません。

direct RGB:

```xml
<fgColor rgb="FF202020"/>
```

theme:

```xml
<fgColor theme="3"/>
```

theme + tint:

```xml
<fgColor theme="3" tint="0.8"/>
```

theme番号はworkbookの `xl/theme/theme1.xml` にあるcolor schemeを参照します。

## 3. 今回のfixture

`libreoffice-theme-fill-boundary.xlsx.base64` はLibreOffice Calcが最終保存した外部生成XLSXです。

最終OOXML:

```text
Theme Dark:
  theme = 3

Theme Light Tint:
  theme = 3
  tint  = 0.8

RGB Control:
  rgb = FF202020
```

theme 3はfixtureのtheme XMLではdark2:

```text
1F497D
```

です。

## 4. SheetJSが行うこと

`cellStyles: true` でreadすると、SheetJSはfill styleをcellの `s` へ付与します。

theme colorについては、theme color schemeを参照してRGBへ解決し、tintがあればtint後のRGBを作ります。

今回の期待は次のとおりです。

```text
theme 3
 -> 1F497D

theme 3 + tint 0.8
 -> C6D9F1
```

MMI bridgeへ入る時点でRGBが存在することをruntime testで固定します。

## 5. MMI bridgeが行うこと

bridgeは色の由来を区別しません。

```text
direct RGB
theme-resolved RGB
theme+tint-resolved RGB
```

のどれでも、`fgColor.rgb` があれば同じtone classifierへ渡します。

### 1F497D

lumaが低いため:

```text
dark
```

### C6D9F1

lumaが高いため:

```text
light
```

となります。

## 6. MMI bridgeが行わないこと

次は行いません。

- theme1.xmlを読む
- theme indexからcolor scheme entryを選ぶ
- tint formulaを再実装する
- system color fallbackを実装する

これらはXLSX parserであるSheetJSの責務です。

## 7. unresolved theme

bridge unit testでは、意図的に:

```text
{ theme: 3 }
```

だけを渡すケースを残します。

RGBが無いので:

```text
other
```

です。

これは重要なfail-closed境界です。

parserから必要な証拠が来なければ、MMIはtheme 3が何色かを推測しません。

## 8. Adapterへの影響

bridge結果が:

```text
dark
```

ならは次のとおりです。

```text
header:fill-present
header:dark-fill
```

`light`ならは次のとおりです。

```text
header:fill-present
header:light-fill
```

を生成します。

`other`はmeaningful fill evidenceにはしません。

## 9. Source profileへの影響

現在は次のとおりです。

```text
sheetjs-ce-xlsx-0.20.3-fill-v1
structure: yes
fill: yes
border: no
```

を維持します。

theme/tintは新しいevidence種類ではありません。

SheetJSによってRGBへ正規化された後は、既存fill evidenceとして扱います。

## 10. なぜprofile versionを上げないのか

MMIの実装や比較契約を変更していないからです。

今回の作業はは次のとおりです。

```text
既に存在するparser behaviorを
外部生成fixtureで実証し、
責務境界を文書化する
```

ものです。

prototype featureの種類も意味も変わりません。

## 11. Testの読み方

### `xlsxFormatSnapshotThemeFixture.test.ts`

実XLSXをSheetJSへ通し:

1. raw SheetJS styleのtheme/tint/RGB
2. bridge後fillTone
3. adapter後fill feature
4. source-profile後prototype feature

の4段階を確認します。

### `sheetJsWorksheetFormatBridge.test.ts`

parserを介さず:

- unresolved theme -> other
- theme + resolved RGB -> dark
- theme + tint + resolved RGB -> light

を確認します。

この2つを組み合わせることで、責務の所在が明確になります。

## 12. 障害時の切り分け

### Raw SheetJS styleにRGBが無い

reader / SheetJS dependency / input theme側を調べます。

bridgeへtheme resolverを追加する前に、parser contractを確認します。

### Raw RGBはあるがfillToneが違う

bridgeのcoarse tone classifierを調べます。

### fillToneは正しいがfeatureが無い

adapterのmeaningful fill filteringを調べます。

### featureはあるが比較されない

source profileを調べます。

この順序で切り分けると、層を跨いだ修正を避けられます。
