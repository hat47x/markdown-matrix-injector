# Issue: Harden highlight and format column selector matching

## Meta
- Type: Bugfix
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/core`, `03_Implement/test`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 2: クエリ言語としての拡張
- Related ADR/Spec: `00_Prompt/requirements.md`, `01_Plans/issues/issue-0012-phase2-highlight-and-format-rendering.md`

## Execution Plan
### Proposed solution (解決策の概要)
- `highlightColumn` / `formatColumn` の列解決をより寛容にし、ヘッダ名の大文字小文字や前後空白の差異でも一致できるようにする。あわせて、HTML に安定した CSS フックを追加して後続のスタイリングを容易にする。

### Acceptance criteria (受入条件)
- [x] `highlightColumn=role` のような大文字小文字差異でも、ヘッダ名列を解決できること。
- [x] `formatColumn= payload : json ` のような前後空白を含む指定でも、対象列セルを整形できること。
- [x] 行 / セルに安定した CSS クラスが付与され、未ハイライト行と整形済みセルも判別できること。
- [x] テストとビルドが通ること。

### Task breakdown (作業分解)
- [x] 列セレクタと format 指定の正規化を追加する。
- [x] 行 / セルクラスの出力を見直す。
- [x] 単体テストを追加する。

### Validation plan (検証計画)
- `cd 03_Implement && npm test` が Pass することを確認する。
- `cd 03_Implement && npm run build` が成功することを確認する。
