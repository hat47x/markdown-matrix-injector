# Phase 1 Core Engine Architecture

> **注記**: 本書は Phase 1〜2 時点のコアエンジン設計スナップショット（歴史的記録）です。
> 拡張の現行のエンドツーエンド挙動・全モジュールの責務・図・コードマップは
> [`../04_Documentation/how-it-works.md`](../04_Documentation/how-it-works.md) に集約しています。まずそちらを参照してください。

## Module map
- `03_Implement/src/parser`: MMI独自記法の抽出と分解。
- `03_Implement/src/core/pathResolver.ts`: Markdown基準 + ワークスペースルートのファイル解決。
- `03_Implement/src/core/workbookLoader.ts`: CSV / XLSX / XML Spreadsheet 2003の読込とmtimeキャッシュ連携。
- `03_Implement/src/core/renderTable.ts`: シート行列からHTMLテーブルへの変換。
- `03_Implement/src/plugin/markdownMatrixPlugin.ts`: `markdown-it` への統合点。

## Phase 1 data flow
1. Markdownテキストから `![[...]]` を抽出する。
2. 対象ファイルをMarkdownファイルからの相対パスで解決し、必要時のみワークスペースルートへフォールバックする。
3. ローダーがファイル拡張子ごとに読込を切り替え、mtime一致時はキャッシュから再利用する。
4. レンダラーが対象シート・範囲・ヘッダ条件を反映してHTMLテーブルへ変換する。
5. 例外発生時はプラグインがエラー表示へフォールバックする。


## Phase 2 preview
- `columns`: 列の射影。
- `transpose`: 行列の転置。
- `grep`: キーワードを含む行の絞り込み。
- `header=数値`: 任意行のヘッダ化。
