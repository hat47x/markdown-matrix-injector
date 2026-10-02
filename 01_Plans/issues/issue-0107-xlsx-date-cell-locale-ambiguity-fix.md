# Issue: XLSX 日付セルがロケール依存の曖昧な短縮形式（例: 4/3/26）で表示される欠陥の是正

## Meta
- Type: Bug
- Status: Done
- Priority: Medium
- Completed: 2026-07-15
- Scope: 03_Implement/src/core/workbookLoader.ts, 03_Implement/test/workbookCache.test.ts
- Expected verification level: unit（日付セル/非日付セルの回帰なし）

## Traceability
- Related Backlog/Phase: requirements.md Phase 1（CSV/Excel/XML読み込み）
- 発見経緯: issue-0106（CSV RFC4180修正）作業中の関連監査。CSVパーサー修正で「自前実装が正しさを損なう」
  パターンが実在すると判明したため、同種の欠陥がXLSX/XML読み込みパスに無いか横断監査した際に発見。

## 背景
`workbookLoader.ts` は `.xlsx` / XML Spreadsheet 2003の読み込みを `XLSX.readFile()`（SheetJS）に委譲し、
`sheet_to_json({ raw: false, ... })` でセルを文字列化する。しかしExcelの**日付型セル**（シリアル値 +
日付書式）は、追加オプション無しではSheetJSの既定短縮形式（例: `4/3/26`）で文字列化される。

これは `EffectiveFrom` / `ExpiresAt` のような日付列が頻出するSIer設計文書（Phase 9ベンチマークパックが
実例）にとって、**月と日を取り違えて誤読しうる**（`4/3/26` は「4月3日」とも「3月4日」とも読める）実害の
ある表示欠陥である。

再現（修正前）は次のとおりです。
```
Excel 日付型セル 2026-04-03 → MMI 表示: "4/3/26"（曖昧）
```

## Execution Plan
### Proposed solution（実施済み）
`XLSX.readFile()` に `{ cellDates: true, dateNF: 'yyyy-mm-dd' }` を追加。実データで以下を確認済み:

- 日付型セルのみISO 8601（`YYYY-MM-DD`）形式で文字列化される。
- 非日付の数値セル（例: `1234.5`, `0.15`）は無変化。
- 日付「らしく見える」テキストセル（例: `"2026-04-03 as text"`）も無変化（型で判定されるため）。
- XML Spreadsheet 2003も同一の `XLSX.readFile()` 経路を通るため同様に適用される。

### Acceptance criteria
- [x] Excelで日付型として入力されたセルが `YYYY-MM-DD` で表示される。
- [x] 非日付の数値・テキストセルに影響がない（回帰なし、既存224テスト全通過を確認）。
- [x] 新規unit 2件（日付セルのISO 8601化・非日付セルの無変化）を追加。

### Validation plan（実績）
```bash
cd 03_Implement
npm run build   # エラーなし
npm test        # 226 tests pass（224 + 新規2件）、phase9 sync OK、guide-sync OK
```
