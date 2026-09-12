# Issue: SheetJS worksheetから書式snapshotを構築するread-only bridge

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/experimental/sheetJsWorksheetFormatBridge.ts`, `03_Implement/test/sheetJsWorksheetFormatBridge.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: requirements.md Phase 1 / Phase 5 / Phase 11
- Related ADR/Spec: ADR-0017-fly-inspired-format-deviation-assistance.md
- Dependency: issue-0114 Done, issue-0115 Done, issue-0116 Done

## Execution Plan
### Proposed solution

SheetJS 0.20.3 のworksheet表現から、issue-0116で定義した `WorksheetFormatSnapshot` へ変換するread-only bridgeを追加する。

安定して扱える情報と、保守的に扱う情報を分離する。

- 確定情報: `!ref`、セル座標、formatted text (`w`) / value (`v`)、`!merges`
- 条件付き情報: `cellStyles: true` で得られる `s` のうち、明示的に認識できる RGB fill と border line style
- 推測しない情報: theme/indexed colorをRGBへ推定する処理、未知style shape、条件付き書式の見た目再現

bridgeはsparse worksheetとdense worksheet (`!data`) の双方を扱う。`!ref`をworksheetの有効範囲として尊重し、範囲外セルを特徴化しない。入力worksheetは変更しない。

styleについてはCommunity Editionが詳細な見た目再現を主目的としないことを前提に、判別できないものを既知styleへ寄せない。RGBが明示されたfillだけをdark / gray / light / otherへ分類し、borderは明示されたtop/right/bottom/leftのline styleだけからgrid / thin / otherを判定する。

参考:
- https://docs.sheetjs.com/docs/api/parse-options/
- https://docs.sheetjs.com/docs/csf/features/merges/
- https://docs.sheetjs.com/docs/csf/sheet/

### Acceptance criteria
- [x] sparse worksheetのセル、formatted text、mergeをsnapshotへ変換できる。
- [x] dense worksheet (`!data`) を同じsnapshot型へ変換できる。
- [x] `!ref`外のセルを無視し、`!ref`欠落worksheetは空として扱う。
- [x] 入力worksheetを変更しない。
- [x] RGB fillはdark / gray / lightへ決定論的に分類し、theme/indexed等の未解決色は`other`に留める。
- [x] 4辺すべてに明示lineがあるborderを`grid`、一部のthin/hair lineを`thin`として分類する。
- [x] styleの存在だけからfill/borderを推測しない。
- [x] 不正な`!ref` / `!merges`は自動修復せず明示エラーにする。
- [x] 既存`workbookLoader`・renderer・extensionから呼ばない。
- [x] ローカルstrict TypeScript検証とunit testが成功する。

### Task breakdown
- [x] sparse / dense worksheetのセル走査を実装する。
- [x] `!ref` / `!merges`変換を実装する。
- [x] 保守的なfill / border分類を実装する。
- [x] read-only / fail-closedを含むunit testを追加する。
- [x] ローカル型検査・unit testの結果を記録する。

### Validation plan

GitHub Actionsはリソース不足のため完了条件に含めない。対象差分をstrict TypeScript条件でコンパイルし、unit testをNode test runnerで実行する。

## Validation evidence

### 2026-09-12 local validation

- 実行環境: Node.js `v22.16.0`, npm `10.9.2`, TypeScript `5.8.3`。
- bridge本体と実際の `sheetJsWorksheetFormatBridge.test.ts` を `--strict --target ES2022 --module NodeNext --moduleResolution NodeNext` で型検査・コンパイルし成功。
- bare環境に`@types/node`がないため、`node:test` / `node:assert/strict`だけ最小shimを使用。製品リポジトリには`@types/node` devDependencyが存在する。
- コンパイル後のunit test: **6 tests / 6 pass / 0 fail**。
- 検証内容: sparse worksheet、dense `!data`、`!ref`範囲、`!merges`、formatted text優先、入力非変更、RGB fill分類、border分類、未解決theme色、異常range/mergeのfail-closed。

### 境界確認

- `workbookLoader`、parser、renderer、extensionからbridgeを呼び出していない。
- bridgeはSheetJSそのものをimportせず、worksheetの公開的なobject shapeだけを受け取る。このため、書式推定ロジックとファイル読込み依存を分離したままテストできる。
- `!ref` / `!merges` / sparse・dense cell storageはSheetJS公式文書に沿って扱う。
- `s`のstyle情報は、RGBやline styleとして明示的に読める場合だけ分類し、theme/indexed colorや未知形状を推測しない。

次段階では、既存の `XLSX.read` を変更せず、実験専用readerで `cellStyles: true` を有効にしてworksheetをこのbridgeへ渡し、実XLSX由来snapshotを生成する。製品経路への統合はその評価後に判断する。
