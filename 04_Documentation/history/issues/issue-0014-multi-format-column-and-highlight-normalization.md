# Issue: ハイライト対象の値を正規化し、複数列の書式指定に対応する

この文書は、当時の提案と完了状態を残したIssue記録です。以下の受入条件・作業項目・検証計画と、その後の計画に関する注記は当時の内容であり、現在の実装状況や後年の判断を新たに確認したものではありません。

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/core`, `03_Implement/test`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 2: クエリ言語としての拡張
- Related ADR/Spec: `00_Prompt/requirements.md`, `04_Documentation/history/issues/issue-0013-highlight-format-selector-hardening.md`

## 当時の実行計画
### 解決方針（当時の提案）
- ハイライトする値の照合でも、前後の空白や大文字・小文字の違いを吸収する。あわせて、`formatColumn`を複数回指定できるようにし、複数の列を同時にコードブロック風に描画できるようにする。

### 受入条件
- [x] `highlightValue= admin ` のような指定でも、対象セル値 `Admin` と一致判定できること。
- [x] `formatColumn` を複数回指定したとき、複数列へ整形描画を適用できること。
- [x] 既存の単一 `formatColumn` 指定との後方互換が維持されること。
- [x] テストとビルドが通ること。

### 作業項目
- [x] highlight比較の正規化を追加する。
- [x] 複数 `formatColumn` 指定のパースと描画判定を実装する。
- [x] 単体テストを追加する。

### 当時の検証計画
- `cd 03_Implement && npm test` がPassすることを確認する。
- `cd 03_Implement && npm run build` が成功することを確認する。
