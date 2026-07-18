# Issue: Implement Phase 1 path resolution and workbook loading

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: `src/core`, `src/plugin`, `src/parser`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 1: コアエンジンとパフォーマンス基盤
- Related ADR/Spec: `00_Prompt/requirements.md`

## Execution Plan
### Proposed solution (解決策の概要)
- モック実装を実データに近づけるため、相対パス解決、CSV/XLSX/XML Spreadsheet 2003 読み込み、レンダリングまでを同期的に実装する。

### Acceptance criteria (受入条件)
- [x] Markdown ファイル基準の相対パス解決とワークスペースルートへのフォールバックができること。
- [x] CSV / XLSX / XML Spreadsheet 2003 を読み込んでシート表現へ正規化できること。
- [x] 汎用 XML はフェイルセーフとしてエラーにできること。
- [x] `markdown-it` プラグインが埋め込み記法を実表データの HTML テーブルまたはエラー表示へ変換できること。
- [x] CLI ベースのテストとビルドが通ること。

### Task breakdown (作業分解)
- [x] パーサとパス解決ロジックを拡張する。
- [x] ワークブックローダーとキャッシュ連携を実装する。
- [x] 実データを使うプラグインテストを追加する。

### Validation plan (検証計画)
- `npm test` がすべて Pass することを確認する。
- `npm run build` が成功することを確認する。
