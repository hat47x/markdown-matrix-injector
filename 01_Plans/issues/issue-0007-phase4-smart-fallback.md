# Issue: Implement Phase 4 smart fallback trigger logic

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: `03_Implement/src/core`, `03_Implement/src/plugin`, `03_Implement/test`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 4: SIer納品品質の担保 (Smart Fallback)
- Related ADR/Spec: `00_Prompt/requirements.md`

## Execution Plan
### Proposed solution (解決策の概要)
- Smart Fallback の発動条件を判定するヘルパーを導入し、`mode=table` の明示指定がない限り「巨大表」または「シート未指定のファイル全体参照」をカード表示へ自動縮退させる。

### Acceptance criteria (受入条件)
- [x] `mode=table` 未指定時、列数 10 超またはセル数 500 超の埋め込みがカード表示へ自動縮退すること。
- [x] `mode=table` を明示した場合、巨大表でもテーブル表示を維持すること。
- [x] シート未指定でファイル全体を参照した場合、カード表示へ自動縮退すること。
- [x] 既存の通常サイズの埋め込み表示は維持されること。
- [x] テストとビルドが通ること。

### Task breakdown (作業分解)
- [x] Smart Fallback 判定ヘルパーを追加する。
- [x] プラグインの描画分岐へ自動縮退ロジックを組み込む。
- [x] 単体テストを追加する。

### Validation plan (検証計画)
- `cd 03_Implement && npm test` が Pass することを確認する。
- `cd 03_Implement && npm run build` が成功することを確認する。
