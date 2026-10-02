# Issue: Implement Phase 2 highlight and formatted cell rendering

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/core`, `03_Implement/test`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 2: クエリ言語としての拡張
- Related ADR/Spec: `00_Prompt/requirements.md`

## Execution Plan
### Proposed solution (解決策の概要)
- 既存の表描画パイプラインへ `highlightColumn` / `highlightValue` / `formatColumn` を追加し、行ハイライトとコードブロック風セル描画をクエリで制御できるようにする。

### Acceptance criteria (受入条件)
- [x] `highlightColumn` と `highlightValue` に一致する行へCSSクラスを付与できること。
- [x] `formatColumn=E:json` のような指定で対象列セルをコードブロック風HTMLに変換できること。
- [x] 既存の `header`, `columns`, `transpose`, `grep` と併用しても退行しないこと。
- [x] テストとビルドが通ること。

### Task breakdown (作業分解)
- [x] 列解決ヘルパーとセル描画分岐を追加する。
- [x] 行ハイライトの判定を実装する。
- [x] 単体テストを追加する。

### Validation plan (検証計画)
- `cd 03_Implement && npm test` がPassすることを確認する。
- `cd 03_Implement && npm run build` が成功することを確認する。
