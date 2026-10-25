# Issue: 実装層のignore設定を移し、カード表示を追加する

この文書は、当時の提案と完了状態を残したIssue記録です。以下の受入条件と検証計画は当時の内容であり、現行製品の仕様や後年の判断を示すものではありません。

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: `03_Implement/.gitignore`, `03_Implement/src/core`, `03_Implement/src/plugin`, `03_Implement/test`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 2 / Phase 4 bridge
- Related ADR/Spec: `00_Prompt/requirements.md`

## 当時の実行計画
### 解決方針（当時の提案）
- `.gitignore` を `03_Implement/` 配下へ移し、実装層のNode / build出力だけを管理する。あわせて、`mode=card` を指定したときに、表の代わりに参照カードを描画する分岐をプラグインへ追加する。

### 受入条件
- [x] `.gitignore` が `03_Implement/` 配下に移動していること。
- [x] `mode=card` 指定時にカード表示を返せること。
- [x] 既存の `mode=table` / 未指定では表描画が維持されること。
- [x] テストとビルドが通ること。

### 作業項目
- [x] ignore設定を移設する。
- [x] カードレンダラーとプラグイン分岐を追加する。
- [x] 単体テストを追加する。

### 当時の検証計画
- `cd 03_Implement && npm test` がPassすることを確認する。
- `cd 03_Implement && npm run build` が成功することを確認する。
