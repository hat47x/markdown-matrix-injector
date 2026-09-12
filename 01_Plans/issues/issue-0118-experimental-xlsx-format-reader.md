# Issue: 実XLSXから書式snapshotを生成する実験専用read-only reader

## Meta
- Type: Feature
- Status: In Progress
- Priority: Medium
- Scope: `03_Implement/src/experimental/xlsxFormatSnapshotReader.ts`, `03_Implement/test/xlsxFormatSnapshotReader.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: requirements.md Phase 1 / Phase 5 / Phase 11
- Related ADR/Spec: ADR-0017-fly-inspired-format-deviation-assistance.md
- Dependency: issue-0117 Done

## Execution Plan
### Proposed solution

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

### Acceptance criteria
- [ ] Excel系4拡張子以外を明示的に拒否する。
- [ ] `cellStyles: true` を含む固定parse optionでreaderを呼ぶ。
- [ ] 指定worksheet / 先頭worksheetを正しく選択する。
- [ ] 存在しないworksheetとworksheet object欠落を明示エラーにする。
- [ ] worksheetをissue-0117 bridgeへ渡しsnapshotを返す。
- [ ] ファイルreaderは原本を書き換えない。
- [ ] 既存 `workbookLoader` / renderer / extensionから本readerを呼ばない。
- [ ] dependency injectionによるローカルstrict TypeScript検証とunit testが成功する。
- [ ] 実SheetJS 0.20.3によるXLSX round-trip試験は、実ライブラリを取得できる環境で別ゲートとして残す。

### Task breakdown
- [x] file readerとbyte parserを実装する。
- [x] parse option / sheet選択 / bridge接続のunit testを追加する。
- [x] 非Excel拒否 / 原本バイト不変のunit testを追加する。
- [ ] ローカル検証結果を記録する。

### Validation plan

GitHub Actionsはリソース不足のため完了条件に含めない。現実行環境ではSheetJS配布tarballを取得できないため、reader interfaceを注入したunit testでロジックを検証する。実SheetJS 0.20.3 round-tripは別Issueで行い、未検証のstyle取得能力を本Issueで完了扱いにしない。
