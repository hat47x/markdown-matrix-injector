# Developer Setup

## 実装コードの場所
- 実装本体: `03_Implement/src/`
- テスト: `03_Implement/test/`
- Node / TypeScript 設定: `03_Implement/package.json`, `03_Implement/tsconfig.json`, `03_Implement/.gitignore`

## 開発コマンド
```bash
cd 03_Implement
npm install
npm test
npm run build
npm run test:e2e
```

## Phase 5 / VSCode integration の再現手順
1. `cd 03_Implement && npm run build`
2. `cd 03_Implement && npm run test:e2e`
3. 必要に応じて VSCode で Markdown ファイルを開き、以下を手動確認する。
   - `![[` で filepath 補完、`#` で sheet 補完、`?` で query parameter 補完
   - `MMI_FILE_NOT_FOUND`, `MMI_INVALID_XML`, `MMI_SHEET_NOT_FOUND` の Diagnostics
   - `markdownMatrixInjector.insertEmbedFromPaste`, `markdownMatrixInjector.insertEmbedFromDrop` の挿入結果

## テストデータ方針
- Excel / Spreadsheet 系のテストデータはリポジトリへ固定ファイルとして追加せず、ユニットテスト内で都度生成する。
- VSCode E2E は既存 fixture workspace を一時コピーし、必要な追加ファイル（例: invalid XML）だけを実行時に生成する。
