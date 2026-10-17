# Issue: Phase 1のコアエンジンを最小構成で試作する

この文書は、Phase 1当時の作業方針と完了状態を残した記録です。以下の状態、受入条件、検証計画は当時の内容を示しており、現在の実装構成や検証結果を更新するものではありません。

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: `src/cache`, `src/parser`, `src/plugin`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 1: コアエンジンとパフォーマンス基盤
- Related ADR/Spec: `00_Prompt/requirements.md`

## 当時の実行計画
### 解決方針（当時の提案）
- TypeScriptで最小限の実装を用意する。独自記法を読み取るパーサ、ファイルの更新時刻（`mtime`）を使うワークブックキャッシュ、`markdown-it`と連携する試作プラグインを対象とする。

### 受入条件
- [x] `![[<filepath>#<sheet>|<range>?<params>]]` の主要要素をパースできること。
- [x] mtimeベースでキャッシュヒット/ミスを判定できること。
- [x] `markdown-it` プラグインから独自記法を検出し、プレースホルダHTMLを描画できること。
- [x] CLIベースの型チェックとテストが通ること。

### 作業項目
- [x] TypeScriptプロジェクトの最小セットアップを追加する。
- [x] 独自記法パーサとワークブックキャッシュを実装する。
- [x] `markdown-it` プラグインのモックアップと単体テストを追加する。

### 当時の検証計画
- `npm test` がすべて通過することを確認する。
- `npm run build` が成功することを確認する。
