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
- TypeScriptベースの最小実装を追加し、独自記法のパーサ、mtimeベースのワークブックキャッシュ、`markdown-it` 連携のモックプラグインを提供する。

### Acceptance criteria (受入条件)
- [x] `![[<filepath>#<sheet>|<range>?<params>]]` の主要要素をパースできること。
- [x] mtimeベースでキャッシュヒット/ミスを判定できること。
- [x] `markdown-it` プラグインから独自記法を検出し、プレースホルダHTMLを描画できること。
- [x] CLIベースの型チェックとテストが通ること。

### Task breakdown (作業分解)
- [x] TypeScriptプロジェクトの最小セットアップを追加する。
- [x] 独自記法パーサとワークブックキャッシュを実装する。
- [x] `markdown-it` プラグインのモックアップと単体テストを追加する。

### Validation plan (検証計画)
- `npm test` がすべてPassすることを確認する。
- `npm run build` が成功することを確認する。
