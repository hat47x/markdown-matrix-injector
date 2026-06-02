# Issue: Normalize highlight values and support multiple formatted columns

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/core`, `03_Implement/test`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 2: クエリ言語としての拡張
- Related ADR/Spec: `00_Prompt/requirements.md`, `01_Plans/issues/issue-0013-highlight-format-selector-hardening.md`

## Execution Plan
### Proposed solution (解決策の概要)
- highlight 判定を値側でも正規化し、前後空白や大文字小文字差異に強くする。あわせて `formatColumn` を複数回指定できるようにし、複数列を同時にコードブロック風描画できるようにする。

### Acceptance criteria (受入条件)
- [x] `highlightValue= admin ` のような指定でも、対象セル値 `Admin` と一致判定できること。
- [x] `formatColumn` を複数回指定したとき、複数列へ整形描画を適用できること。
- [x] 既存の単一 `formatColumn` 指定との後方互換が維持されること。
- [x] テストとビルドが通ること。

### Task breakdown (作業分解)
- [x] highlight 比較の正規化を追加する。
- [x] 複数 `formatColumn` 指定のパースと描画判定を実装する。
- [x] 単体テストを追加する。

### Validation plan (検証計画)
- `cd 03_Implement && npm test` が Pass することを確認する。
- `cd 03_Implement && npm run build` が成功することを確認する。
