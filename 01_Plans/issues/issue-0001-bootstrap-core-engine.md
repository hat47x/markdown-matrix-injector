# Issue: Bootstrap core engine mockup for Phase 1

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: `src/cache`, `src/parser`, `src/plugin`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 1: コアエンジンとパフォーマンス基盤
- Related ADR/Spec: `00_Prompt/requirements.md`

## Execution Plan
### Proposed solution (解決策の概要)
- TypeScript ベースの最小実装を追加し、独自記法のパーサ、mtime ベースのワークブックキャッシュ、`markdown-it` 連携のモックプラグインを提供する。

### Acceptance criteria (受入条件)
- [x] `![[<filepath>#<sheet>|<range>?<params>]]` の主要要素をパースできること。
- [x] mtime ベースでキャッシュヒット/ミスを判定できること。
- [x] `markdown-it` プラグインから独自記法を検出し、プレースホルダ HTML を描画できること。
- [x] CLI ベースの型チェックとテストが通ること。

### Task breakdown (作業分解)
- [x] TypeScript プロジェクトの最小セットアップを追加する。
- [x] 独自記法パーサとワークブックキャッシュを実装する。
- [x] `markdown-it` プラグインのモックアップと単体テストを追加する。

### Validation plan (検証計画)
- `npm test` がすべて Pass することを確認する。
- `npm run build` が成功することを確認する。
