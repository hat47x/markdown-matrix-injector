# Portable XLSX Decoder Evaluation v1

## 目的

issue-0203でPortable CoreのXLSX読み込み経路を比較するとき、binary size（実行ファイルの大きさ）だけを優先してCandidate semantics（候補の意味と契約）を弱めないため、評価基準を定める。

本書はdecoder（XLSXを読み取る処理）の採用を決定するものではない。既存のTypeScript / SheetJS経路が保持する意味を基準に、標準Go、TinyGo、WASMで利用できる候補を共通のcorpus（検証ケース群）で比較するためのgate（評価条件）を示す。

## MMIがXLSX decodeで失ってはいけない意味

評価の参照先となる`workbookLoader.ts`は、単なる文字列の二次元配列ではなく`SheetSource`（座標やセル情報を含むシートモデル）を構築する。候補decoderは少なくとも次の情報を保持できなければならない。

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

上記8項目を満たさないdecoderは、binaryが小さくてもPortable Core v1のXLSX実装候補にはしない。

## 比較候補

### A. 現行SheetJS host / TypeScript

役割: **意味論の参照基準**。

- 現在のMMI実装で使用中。
- `dense: true`、`cellDates: true`、`dateNF: yyyy-mm-dd`。
- `!ref`、`!merges`、dense `!data`、cellの`.w/.v/.t/.f`を `SheetSource` へ写像する。
- Portable runtimeそのものではない。Node/SheetJS依存を含むため、他実装を測る基準として残す。

### B. Excelize v2.11.0

役割: **最初に実測するGo XLSX候補**。

以下は2026-10時点のupstream（提供元の公開情報）であり、現在の採用済み依存関係を示すものではない。

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

Go 1.25以上の測定環境を用意できた段階で、v2.11.0に版を固定し、まずconformance（共通条件への適合性）を検証する。

### C. tealeg/xlsx v4系

役割: **比較候補**。

- BSD-3-Clause。
- 旧GitHub repositoryは2025-08にarchiveされ、v4はCodebergへ移行している。
- 長い利用実績はあるが、現行maintenance/source取得経路を含めて評価が必要。
- Excelizeより先に採用する根拠は現時点ではない。

### D. standard-library-only OOXML decoder

役割: **依存最小化が本当に必要な場合の後段候補**。

`archive/zip`と`encoding/xml`だけでもworksheet XMLの読み取り自体は可能だが、MMIが必要とするのはXML cell value（セルの値）だけではない。shared strings、styles、number/date formatting、merge、formula cached result、used-range origin、安全なindex上限まで同じ意味で実装する必要がある。

そのため、「XLSXはZIP+XMLなので自作すれば小さい」という見込みだけでは着手しない。Excelize等の既存候補がサイズや互換性に関するgateを満たさないと実測で確認された場合に限り、比較対象に加える。

### E. host-decoded neutral sheet model

役割: **WASM/Web hostのfallback比較**。

Host側のSheetJS等でXLSXをdecode（読み取り・変換）し、Portable Coreへ中立的なSheetSource相当のmodelを渡す方式である。既存の意味論を再利用しやすい一方、Core単独でsource bytesからCandidateを作るv1の独立性は弱くなる。

この方式は「Go XLSX decoder」と同一視せず、host profile（Host側の処理を含む構成）として別に計測する。

## Conformance gate

候補decoderは同じXLSX fixture（検証用ファイル）を入力として、少なくとも次の観測結果を比較する。

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

最初のXLSX fixtureだけで採否を判断しない。少なくとも次のケースを追加corpusに含める。

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

同じsource/Candidate corpus（入力と期待する候補の検証群）を対象に、次の測定・確認項目を区別して記録する。

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

短命のNode hostを含むWASM processの測定値と、browserや長寿命のWASM runtimeで得た測定値は、同じ実行条件の結果として混同しない。

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

このsnapshot（調査時点の記録）は候補に関する当時の情報であり、MMIのproduction dependency（製品の正式な依存先）の指定ではない。
