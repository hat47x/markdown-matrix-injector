# Issue: Phase 1のパス解決とワークブック読み込みを実装する

この文書は、Phase 1当時の作業方針と完了状態を残した記録です。以下の状態、受入条件、検証計画は当時の内容を示しており、現在の実装構成や検証結果を更新するものではありません。

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: `src/core`, `src/plugin`, `src/parser`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 1: コアエンジンとパフォーマンス基盤
- Related ADR/Spec: `00_Prompt/requirements.md`

## 当時の実行計画
### 解決方針（当時の提案）
- 試作段階の処理を実際の表データに近づけるため、相対パスの解決からCSV / XLSX / XML Spreadsheet 2003の読み込み、表の描画までを同期的に実装する。

### 受入条件
- [x] Markdownファイル基準の相対パス解決とワークスペースルートへのフォールバックができること。
- [x] CSV / XLSX / XML Spreadsheet 2003を読み込んでシート表現へ正規化できること。
- [x] 汎用XMLはフェイルセーフとしてエラーにできること。
- [x] `markdown-it` プラグインが埋め込み記法を実表データのHTMLテーブルまたはエラー表示へ変換できること。
- [x] CLIベースのテストとビルドが通ること。

### 作業項目
- [x] パーサとパス解決ロジックを拡張する。
- [x] ワークブックローダーとキャッシュ連携を実装する。
- [x] 実データを使うプラグインテストを追加する。

### 当時の検証計画
- `npm test` がすべて通過することを確認する。
- `npm run build` が成功することを確認する。
