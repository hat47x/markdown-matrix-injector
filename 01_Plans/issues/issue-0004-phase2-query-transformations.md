# Issue: Implement query-based table transformations for Phase 2

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: `03_Implement/src/core`, `03_Implement/test`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 2: クエリ言語としての拡張
- Related ADR/Spec: `00_Prompt/requirements.md`

## Execution Plan
### Proposed solution (解決策の概要)
- `renderTable` に対して `columns`, `transpose`, `grep`, `header=数値` を順次適用する変換パイプラインを追加し、クエリ言語としての有用性を高める。

### Acceptance criteria (受入条件)
- [x] `columns=A,C` で指定列のみ描画できること。
- [x] `transpose=true` で行列を反転できること。
- [x] `grep=...` で一致する行のみを残せること。
- [x] `header=first` に加えて `header=2` のような数値指定を扱えること。
- [x] テストとビルドが通ること。

### Task breakdown (作業分解)
- [x] テーブル変換ロジックを追加する。
- [x] 単体テストを拡張する。
- [x] CLIで検証する。

### Validation plan (検証計画)
- `cd 03_Implement && npm test` がPassすることを確認する。
- `cd 03_Implement && npm run build` が成功することを確認する。
