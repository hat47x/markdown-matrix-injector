# Portable XLSX Decoder Evaluation v1

## 目的

issue-0203でPortable CoreのXLSX経路を比較するとき、binary sizeだけを理由にCandidate semanticsを弱めないための評価基準を定める。

この文書はdecoder採用を決定するものではない。現行TypeScript / SheetJS経路が保持している意味を基準に、標準Go、TinyGo、WASMで使える候補を同じcorpusで比較するためのgateである。

## MMIがXLSX decodeで失ってはいけない意味

現行 `workbookLoader.ts` は、単なる二次元の文字列配列ではなく `SheetSource` を構築する。候補decoderは少なくとも次を保持できなければならない。

1. **sheet identity**
   - sheet名と列挙順を保持する。
   - source pathやworkspace探索はCoreへ持ち込まない。
2. **physical coordinates**
   - worksheetのused rangeの原点を保持する。
   - 空行・空列を詰めてA1起点へ移動しない。
3. **merged ranges**
   - 原本が宣言したmergeだけを保持し、空セルから推測しない。
4. **display text**
   - Candidateの表示・fingerprintに使う文字列を、Excel/現行SheetJSの表示結果と同じ意味で取得できる。
   - 数値、日付、boolean、error、文字列を区別したraw type/valueも保持する。
5. **number/date format**
   - cell固有formatを尊重する。
   - date cellに固有formatが無い場合、現行参照実装と同じく曖昧なlocale短縮表記へ落とさず、`yyyy-mm-dd`相当へ正規化できる。
6. **formula**
   - formula textを保持できる。
   - MMIはformulaを再計算しない。保存済みresultだけを表示値として扱う。
   - external linkやmacroを実行・更新しない。
7. **OOXML string forms**
   - shared string、inline string等、通常のExcel生成物に現れる文字列表現を扱える。
8. **fail-closed security**
   - 異常なrow/column index、shared-string index、破損ZIP/XML等で無制限allocationやpanicを起こさない。
   - decoder自身がnetworkや外部resourceを解決しない。

この8項目を満たさないdecoderは、binaryが小さくてもPortable Core v1のXLSX実装候補にしない。

## 比較候補

### A. 現行SheetJS host / TypeScript

役割: **意味論の参照基準**。

- 現在のMMI実装で使用中。
- `dense: true`、`cellDates: true`、`dateNF: yyyy-mm-dd`。
- `!ref`、`!merges`、dense `!data`、cellの`.w/.v/.t/.f`を `SheetSource` へ写像する。
- Portable runtimeそのものではない。Node/SheetJS依存を含むため、他実装を測る基準として残す。

### B. Excelize v2.11.0

役割: **最初に実測するGo XLSX候補**。

2026-10時点のupstream:

- module: `github.com/xuri/excelize/v2`
- release: v2.11.0
- license: BSD-3-Clause
- minimum Go: 1.25.0
- pure GoのXLSX/XLSM reader/writer。
- upstreamには `excelize-wasm` companion projectもあり、browser / Node等のWebAssembly利用経路を持つ。
- v2.11.0 releaseではworksheetの異常row indexによる過大allocationやshared-string index由来panic等のsecurity fixが入っている。

注意:

- 現在のGo 1.23.2比較環境ではv2.11.0をそのままbuildできない。
- 古いExcelizeへversionを下げるだけでは、現行security fixを失う可能性があるため比較の近道とは扱わない。
- `go.mod`は複数のdirect/indirect moduleを持つ。runtime binaryへ実際に入るサイズはsource依存数ではなくbuild artifactで測る。
- ExcelizeのAPIがMMIのdisplay text / raw type / formula / merge / used-range semanticsをどこまで一致させられるかは未検証である。

測定環境をGo 1.25以上で用意できたら、v2.11.0を固定して最初にconformanceを実行する。

### C. tealeg/xlsx v4系

役割: **比較候補**。

- BSD-3-Clause。
- 旧GitHub repositoryは2025-08にarchiveされ、v4はCodebergへ移行している。
- 長い利用実績はあるが、現行maintenance/source取得経路を含めて評価が必要。
- Excelizeより先に採用する根拠は現時点ではない。

### D. standard-library-only OOXML decoder

役割: **依存最小化が本当に必要な場合の後段候補**。

`archive/zip` + `encoding/xml`だけでworksheet XMLを読むこと自体は可能だが、MMIが必要なのはXML cell valueだけではない。shared strings、styles、number/date formatting、merge、formula cached result、used-range origin、安全なindex上限を同じ意味で実装する必要がある。

したがって「XLSXはZIP+XMLなので自作すれば小さい」という理由だけでは着手しない。Excelize等の既存候補がサイズ/互換性gateを満たさないことが実測された場合にのみ比較対象へ上げる。

### E. host-decoded neutral sheet model

役割: **WASM/Web hostのfallback比較**。

Host側のSheetJS等でXLSXをdecodeし、Portable Coreへ中立なSheetSource相当modelを渡す方式。現行意味論を再利用しやすい一方、Core単独でsource bytesからCandidateを作るv1の独立性は弱くなる。

この方式は「Go XLSX decoder」と同じものとして数えず、host profileとして別に測る。

## Conformance gate

候補decoderは同じXLSX fixtureから、少なくとも次を比較する。

| 項目 | 比較 |
| --- | --- |
| source digest | request bytesのSHA-256が一致 |
| sheet | 名称・順序が一致 |
| physical range | used range原点とCandidate A1が一致 |
| merge | 宣言mergeから得る境界が一致 |
| display text | Candidate fingerprint材料が一致 |
| cell type/raw value | header/type判定に必要な型が一致 |
| date/number display | 現行SheetJS参照と一致 |
| formula | 保存済みresultを使い、再計算しない |
| Candidate | kind / locator / claim / provenance / fingerprint / referenceが一致 |
| malformed input | fail-closedし、panic/過大allocationを起こさない |

最初のXLSX fixtureだけで採否しない。最低でも、次を追加corpusに含める。

- used rangeがA1以外から始まるsheet
- 空行を含むtable
- merged cellを含むtable
- shared string / inline string
- number / boolean / error
- date cell（固有formatあり/なし）
- formula + saved result
- 複数sheet
- 異常なrow/shared-string indexを含む破損fixture

## 測定

同じsource/Candidate corpusについて次を分けて記録する。

- native binary bytes
- WASM raw bytes / 配布時圧縮bytes
- startup / 1 request latency
- 長寿命processでのrequest latency
- peak RSS / WASM host memory
- Go/toolchain version
- transitive module取得量
- OS / WASM support
- license / attribution
- maintenance / security update cadence

短命Node host込みのWASM process測定と、browserや長寿命WASM runtimeの測定は混同しない。

## 現時点の判断

1. CSVで成立した約2 MBの標準Go binaryをXLSX込みサイズの期待値として扱わない。
2. まずGo 1.25以上の隔離環境でExcelize v2.11.0を固定し、上記conformanceとartifact増分を測る。
3. TinyGoについてはExcelizeのbuild可否を先に確認し、非対応機能が多い場合はCore semanticsを削らずhost/native profileへ分離する。
4. Excelizeがgateを満たし、配布増分が許容範囲なら自作OOXML decoderを作らない。
5. Excelizeが大き過ぎる/非互換なら、tealeg/xlsxまたは限定OOXML decoderを同じgateで比較する。
6. decoderの軽量化のためにdisplay text、merge、formula saved result等を落とす選択はしない。

## Upstream snapshot

2026-10-04確認。

- Excelize v2.11.0: https://github.com/qax-os/excelize/tree/v2.11.0
- Excelize documentation: https://xuri.me/excelize/
- Excelize WASM: https://github.com/xuri/excelize-wasm
- tealeg/xlsx migration notice: https://github.com/tealeg/xlsx

このsnapshotは調査時点の候補情報であり、MMIのproduction dependency指定ではない。
