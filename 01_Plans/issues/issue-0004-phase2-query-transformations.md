# Issue: Phase 2のクエリ指定による表の変換を実装する

この文書は、当時の提案と完了状態を残したIssue記録です。以下の受入条件と検証計画は当時の内容であり、現行製品の仕様や後年の判断を示すものではありません。

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: `03_Implement/src/core`, `03_Implement/test`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 2: クエリ言語としての拡張
- Related ADR/Spec: `00_Prompt/requirements.md`

## 当時の実行計画
### 解決方針（当時の提案）
- `renderTable` に、`columns`、`transpose`、`grep`、`header=数値` を順に適用する変換処理を追加する。これにより、クエリ言語としての有用性を高める。

### 受入条件
- [x] `columns=A,C` で指定列のみ描画できること。
- [x] `transpose=true` で行列を反転できること。
- [x] `grep=...` で一致する行のみを残せること。
- [x] `header=first` に加えて `header=2` のような数値指定を扱えること。
- [x] テストとビルドが通ること。

### 作業項目
- [x] テーブル変換ロジックを追加する。
- [x] 単体テストを拡張する。
- [x] CLIで検証する。

### 当時の検証計画
- `cd 03_Implement && npm test` がPassすることを確認する。
- `cd 03_Implement && npm run build` が成功することを確認する。
