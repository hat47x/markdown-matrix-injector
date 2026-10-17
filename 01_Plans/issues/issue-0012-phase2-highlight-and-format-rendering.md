# Issue: Phase 2の行ハイライトとセル書式の描画を追加する

この文書は、当時の提案と完了状態を残したIssue記録です。受入条件・チェック状態・検証計画、および記載がある場合の進捗注記は当時の内容であり、現在の実装や後年の判断を新たに確認したものではありません。

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/core`, `03_Implement/test`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 2: クエリ言語としての拡張
- Related ADR/Spec: `00_Prompt/requirements.md`

## 当時の実行計画
### 解決方針（当時の提案）
- 既存の表描画処理に`highlightColumn`、`highlightValue`、`formatColumn`を追加する。クエリの指定によって、条件に合う行を目立たせる表示と、セルをコードブロック風に描画する処理を制御できるようにする。

### 受入条件
- [x] `highlightColumn` と `highlightValue` に一致する行へCSSクラスを付与できること。
- [x] `formatColumn=E:json` のような指定で対象列セルをコードブロック風HTMLに変換できること。
- [x] 既存の `header`, `columns`, `transpose`, `grep` と併用しても退行しないこと。
- [x] テストとビルドが通ること。

### 作業項目
- [x] 列解決ヘルパーとセル描画分岐を追加する。
- [x] 行ハイライトの判定を実装する。
- [x] 単体テストを追加する。

### 当時の検証計画
- `cd 03_Implement && npm test` がPassすることを確認する。
- `cd 03_Implement && npm run build` が成功することを確認する。
