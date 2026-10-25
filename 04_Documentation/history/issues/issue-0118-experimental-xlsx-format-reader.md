# Issue: Excelファイルから書式スナップショットを生成する実験用読み取り専用reader

この文書は当時のIssue記録です。2026年9月12日の5件のunit test成功は、注入したfake readerと最小stubを用いたローカル検証です。実SheetJS 0.20.3によるWorkbook round-tripやstyle情報の再現は未検証のまま保持し、製品経路への統合とは区別します。

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/experimental/xlsxFormatSnapshotReader.ts`, `03_Implement/test/xlsxFormatSnapshotReader.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: requirements.md Phase 1 / Phase 5 / Phase 11
- Related ADR/Spec: ADR-0017-fly-inspired-format-deviation-assistance.md
- Dependency: issue-0117 Done

## 当時の実行計画
### 解決方針（当時の提案）

既存 `workbookLoader` を変更せず、実験専用readerを追加する。対象ファイルをread-onlyで読み、SheetJS 0.20.3の `XLSX.read` に `cellStyles: true` を含む専用optionを渡し、選択worksheetをissue-0117のbridgeへ渡して `WorksheetFormatSnapshot` を生成する。

対象拡張子は `.xlsx` / `.xls` / `.xlsm` / `.xlsb` に限定する。CSV / XML / TSVなどへ書式推定を拡張しない。

readerは次を固定する。

- `type: 'buffer'`
- `dense: false`
- `cellStyles: true`
- `cellText: true`
- `cellDates: true`
- `dateNF: 'yyyy-mm-dd'`

sheet名が指定されなければ先頭worksheetを使う。指定sheetが存在しない場合は候補一覧を伴う明示エラーとする。worksheet objectが欠落している場合もfail-closedとする。

テスト可能性のため、byte列からsnapshotへ変換するpure寄りの関数ではSheetJS reader interfaceを注入可能とし、parse optionとbridge接続をSheetJS本体なしでも検証できる。製品用entry pointだけが既存 `xlsx` dependencyと `fs.readFileSync` を使う。

### 受入条件（Acceptance criteria）
- [x] Excel系4拡張子以外を明示的に拒否する。
- [x] `cellStyles: true` を含む固定parse optionでreaderを呼ぶ。
- [x] 指定worksheet / 先頭worksheetを正しく選択する。
- [x] 存在しないworksheetとworksheet object欠落を明示エラーにする。
- [x] worksheetをissue-0117 bridgeへ渡しsnapshotを返す。
- [x] ファイルreaderは原本を書き換えない。
- [x] 既存 `workbookLoader` / renderer / extensionから本readerを呼ばない。
- [x] dependency injectionによるローカルstrict TypeScript検証とunit testが成功する。
- [x] 実SheetJS 0.20.3によるXLSX round-trip試験は、実ライブラリを取得できる環境で別ゲートとして残す。

### 作業項目（Task breakdown）
- [x] file readerとbyte parserを実装する。
- [x] parse option / sheet選択 / bridge接続のunit testを追加する。
- [x] 非Excel拒否 / 原本バイト不変のunit testを追加する。
- [x] ローカル検証結果を記録する。

### 当時の検証計画（Validation plan）

GitHub Actionsはリソース不足のため完了条件に含めない。現実行環境ではSheetJS配布tarballを取得できないため、reader interfaceを注入したunit testでロジックを検証する。実SheetJS 0.20.3 round-tripは別Issueで行い、未検証のstyle取得能力を本Issueで完了扱いにしない。

## Validation evidence

### 2026-09-12 local validation

- 実行環境: Node.js `v22.16.0`, npm `10.9.2`, TypeScript `5.8.3`。
- `xlsxFormatSnapshotReader.ts`、issue-0117 bridge、実際のreader testを `--strict --target ES2022 --module NodeNext --moduleResolution NodeNext` で型検査・コンパイルし成功。
- 実行環境にSheetJS本体を取得できないため、`xlsx` moduleは最小stub、`parseXlsxFormatSnapshot`にはfake readerを注入してロジックを検証した。
- コンパイル後のunit test: **5 tests / 5 pass / 0 fail**。
- 検証内容: `cellStyles: true`等の固定parse option、指定sheet/先頭sheet選択、欠落sheetのfail-closed、bridge接続、非Excel拒否、ファイルreader実行時の原本バイト不変。

### 未検証として残すもの

SheetJS公式tarballは公開されているが、この実行環境ではbinary tarballを取得できなかった。そのため、本IssueはSheetJS 0.20.3本体が実XLSXからどのstyle shapeを返すかを実測していない。

特に次は推測で完了扱いにしない。

- Excelで保存されたfillがCommunity Editionの `s` にどの粒度で復元されるか。
- borderが期待するtop/right/bottom/left形で復元される割合。
- theme/indexed colorが実ファイルでどの程度現れるか。
- `.xls` / `.xlsb`でXLSXと同じstyle観測が成立するか。

これらはissue-0119で実Workbook round-trip / fixture採取として扱う。そこで十分なstyle情報が得られない場合は、bridgeやmatcherを無理に緩めず、OpenXMLの限定的read-only解析やstyle非依存特徴へ設計を戻す。
