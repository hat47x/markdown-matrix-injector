# Issue: ハイライトとセル書式の列指定を表記ゆれに強くする

この文書は、当時の提案と完了状態を残したIssue記録です。以下の受入条件・作業項目・検証計画と、その後の計画に関する注記は当時の内容であり、現在の実装状況や後年の判断を新たに確認したものではありません。

## Meta
- Type: Bugfix
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/core`, `03_Implement/test`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 2: クエリ言語としての拡張
- Related ADR/Spec: `00_Prompt/requirements.md`, `01_Plans/issues/issue-0012-phase2-highlight-and-format-rendering.md`

## 当時の実行計画
### 解決方針（当時の提案）
- `highlightColumn`や`formatColumn`で指定する列を、ヘッダ名の大文字・小文字や前後の空白が異なっていても見つけられるようにする。あわせて、HTMLに安定したCSS用の目印（CSSフック）を設け、後から表示スタイルを調整しやすくする。

### 受入条件
- [x] `highlightColumn=role` のような大文字小文字差異でも、ヘッダ名列を解決できること。
- [x] `formatColumn= payload : json ` のような前後空白を含む指定でも、対象列セルを整形できること。
- [x] 行 / セルに安定したCSSクラスが付与され、未ハイライト行と整形済みセルも判別できること。
- [x] テストとビルドが通ること。

### 作業項目
- [x] 列セレクタとformat指定の正規化を追加する。
- [x] 行 / セルクラスの出力を見直す。
- [x] 単体テストを追加する。

### 当時の検証計画
- `cd 03_Implement && npm test` がPassすることを確認する。
- `cd 03_Implement && npm run build` が成功することを確認する。
