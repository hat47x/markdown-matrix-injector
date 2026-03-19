# Issue: Relocate implementation ignore rules and add card mode rendering

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: `03_Implement/.gitignore`, `03_Implement/src/core`, `03_Implement/src/plugin`, `03_Implement/test`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 2 / Phase 4 bridge
- Related ADR/Spec: `00_Prompt/requirements.md`

## Execution Plan
### Proposed solution (解決策の概要)
- `.gitignore` を `03_Implement/` 配下へ移し、実装層の Node / build 出力だけを管理する。あわせて、`mode=card` 指定時に表ではなく参照カードを描画できる分岐をプラグインへ追加する。

### Acceptance criteria (受入条件)
- [x] `.gitignore` が `03_Implement/` 配下に移動していること。
- [x] `mode=card` 指定時にカード表示を返せること。
- [x] 既存の `mode=table` / 未指定では表描画が維持されること。
- [x] テストとビルドが通ること。

### Task breakdown (作業分解)
- [x] ignore 設定を移設する。
- [x] カードレンダラーとプラグイン分岐を追加する。
- [x] 単体テストを追加する。

### Validation plan (検証計画)
- `cd 03_Implement && npm test` が Pass することを確認する。
- `cd 03_Implement && npm run build` が成功することを確認する。
