# Issue: SheetJS worksheetから書式snapshotを構築するread-only bridge

## Meta
- Type: Feature
- Status: In Progress
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
- [ ] sparse worksheetのセル、formatted text、mergeをsnapshotへ変換できる。
- [ ] dense worksheet (`!data`) を同じsnapshot型へ変換できる。
- [ ] `!ref`外のセルを無視し、`!ref`欠落worksheetは空として扱う。
- [ ] 入力worksheetを変更しない。
- [ ] RGB fillはdark / gray / lightへ決定論的に分類し、theme/indexed等の未解決色は`other`に留める。
- [ ] 4辺すべてに明示lineがあるborderを`grid`、一部のthin/hair lineを`thin`として分類する。
- [ ] styleの存在だけからfill/borderを推測しない。
- [ ] 不正な`!ref` / `!merges`は自動修復せず明示エラーにする。
- [ ] 既存`workbookLoader`・renderer・extensionから呼ばない。
- [ ] ローカルstrict TypeScript検証とunit testが成功する。

### Task breakdown
- [x] sparse / dense worksheetのセル走査を実装する。
- [x] `!ref` / `!merges`変換を実装する。
- [x] 保守的なfill / border分類を実装する。
- [x] read-only / fail-closedを含むunit testを追加する。
- [ ] ローカル型検査・unit testの結果を記録する。

### Validation plan

GitHub Actionsはリソース不足のため完了条件に含めない。対象差分をstrict TypeScript条件でコンパイルし、unit testをNode test runnerで実行する。
