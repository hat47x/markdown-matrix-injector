# Real XLSX runtime boundary guide

この文書は、experimental worksheet-format pathで「実XLSX bytesをSheetJSへ通したとき、どこまでをcontractとして読んでよいか」を説明します。

## 1. これまでとの違い

従来testには:

- fake SheetJS worksheet object
- 手作り `WorksheetFormatSnapshot`
- 直接構成したfeature vector

がありました。

今回のtestはSheetJS CE 0.20.3自身にXLSX bytesを書かせ、そのbytesを実readerへ戻します。

```text
SheetJS worksheet
 -> XLSX.write
 -> XLSX bytes
 -> XLSX.read
 -> SheetJS worksheet
 -> WorksheetFormatSnapshot
 -> adapter / matcher
```

最低でもXLSX ZIP/XML serialization境界を通す点が異なります。

## 2. 強く固定するcontract

### Merge ranges

`!merges` はsnapshotの:

```text
startRow
startColumn
endRow
endColumn
```

へ変換します。

### Covered merged cells

mergeに覆われた従属cellが実readerから返らない場合、bridgeはそれをinventしません。

merge topologyは `merges` から、cell presenceは `cells` から別々に読みます。

### Blank cells

read結果にcell objectが無いblank positionはsnapshot cellとして補いません。

そのためbody coverage / occupancyは「Excel grid上の列数」ではなく「実際に観測されたnon-empty cell presence」を使います。

### Relative structure

metadata preambleや絶対row/column位置ではなく:

- title/header gap
- header/body gap
- table内のrelative columns
- actual header-column set

を使います。

## 3. Gapped headerの読み方

たとえば実XLSXが:

```text
B: ID
C: Name
D: [blank]
E: State
F: Note
```

ならは次のとおりです。

```text
headerColumns = [1, 2, 4, 5]
layout:5-columns
layout:header-gapped
```

です。

body coverageはB:C:E:Fの4実header列に対して判定します。

空いているD列を「missing header value」として数えません。

## 4. Titleなしの扱い

title mergeが無ければ:

- `region:title-row`
- `layout:title-span:*`
- `layout:title-header-gap:*`

は出しません。

「普通はtitleがあるはず」という補完はしません。

## 5. Fillだけ慎重に扱う理由

readerには `cellStyles: true` を指定しています。

しかし今回のtest fixture writerもSheetJS CEです。

ここでは次のとおりです。

```text
cell.s = { fill: ... }
```

を設定しても、CE writerが任意styleをどこまでXLSXへexportするかは、input readerの能力とは別問題です。

したがってruntime-generated fixtureでは:

```text
undefined
or
dark
```

を許容します。

これは曖昧なproduction contractではありません。

**このtestがfill contractを判定しない**という明示的な非責務です。

実際の外部生成XLSXを入手した時点で、別testとしてfill guaranteeを強く固定します。

## 6. Real XLSXからmatcherまで

実XLSXで:

- 1 label rename
- first body gap

を同時に入れ、read後snapshotからprototype/matcherへ進めます。

structure-only profileでは差異familyが:

```text
semantic-label
relative-position
table-skeleton
```

の3つになることを確認します。

ここで重要なのはconfidence値そのものではなく、reader roundtrip後もmulti-family identityが消えないことです。

## 7. 実装を読む順番

1. `xlsxFormatSnapshotReader.ts`
2. `sheetJsWorksheetFormatBridge.ts`
3. `worksheetFormatFeatureAdapter.ts`
4. `worksheetFormatPrototype.ts`
5. `xlsxFormatSnapshotReader.test.ts`
6. `sheetJsWorksheetFormatBridge.test.ts`
7. `xlsxFormatSnapshotRealRuntime.test.ts`
8. `snapshot-drift-evaluation.md`
9. issue-0130
10. issue-0131

fake-reader testとreal-runtime testは競合しません。

- fake-reader: read options / error handlingを精密に固定
- bridge unit: worksheet objectの変換規則を精密に固定
- real runtime: XLSX byte serialization/parser境界を確認

という役割分担です。

## 8. 実行環境について

real runtime testにはrepositoryのpinned `xlsx@0.20.3` dependencyが必要です。

依存がinstallされていない環境では実行できません。

その場合はtestを成功扱いせず、未実行として記録してください。

GitHub Actionsが利用できない場合も、runner不足をtest successへ読み替えません。

## 9. 次に強化する場所

次は外部アプリ生成XLSXを対象にします。

特には次のとおりです。

- RGB fill
- theme fill
- merged cells
- intentionally blank cells
- titleなし
- metadata preamble
- gapped header

をsmall fixtureで確認します。

この結果によって初めて、現在のSheetJS source profileにおけるfill evidenceの保証範囲を再評価します。
