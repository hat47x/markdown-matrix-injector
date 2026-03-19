# VSCode Engine E2E Testing Guide

## Overview
Markdown Matrix Injector では、Docker コンテナ内でも VSCode Extension Host を起動した自動検証を行えるようにしています。現在の Phase 5 E2E は、実際の VSCode エンジン上で次の 4 系統を確認します。

- `markdownMatrixInjector.renderEmbedForTest` による HTML 生成。
- Markdown 補完 (`![[` → filepath / `#` → sheet / `?` → query parameter)。
- Problems パネル相当の Diagnostics 生成（file not found / invalid XML / sheet not found）。
- Paste / D&D 入口コマンドによる Markdown 挿入。

## Prerequisites
- Node.js / npm
- `xvfb-run` (`sudo apt-get install -y xvfb` など)
- Electron が利用する基本ライブラリ群
- `npm install` 済みであること

## Commands
```bash
cd 03_Implement
npm run build
npm run test:e2e
```

## What `npm run test:e2e` does
1. `npm run build` で Extension Host 用のテストバンドルを生成する。
2. `scripts/run-vscode-e2e.sh` が `xvfb-run` の有無を確認し、仮想ディスプレイ上で `test/e2e/runTest.ts` を起動する。
3. `runTest.ts` が fixture workspace を一時ディレクトリへ複製し、Diagnostics 用の `invalid.xml` を追加する。
4. `@vscode/test-electron` が VSCode を取得し、開発中の拡張を読み込んだ Extension Host を立ち上げる。
5. `test/e2e/suite/extensionHost.test.ts` がコマンド・補完・Diagnostics・Paste/D&D コマンドの通し確認を実行する。

## Current assertions
- `renderEmbedForTest` が table/card の既存レンダリングを返す。
- `vscode.executeCompletionItemProvider` 経由で filepath / sheet / query parameter の候補が取得できる。
- Markdown 文書上で `MMI_FILE_NOT_FOUND`, `MMI_INVALID_XML`, `MMI_SHEET_NOT_FOUND` が Diagnostics として取得できる。
- `markdownMatrixInjector.insertEmbedFromPaste` / `markdownMatrixInjector.insertEmbedFromDrop` がエディタへ embed 記法を挿入できる。

## Stream A integration points reflected in E2E
- Activation: `onLanguage:markdown` と各 command activation を前提に、Markdown 文書を開いて Extension Host を有効化する。
- Commands:
  - `markdownMatrixInjector.renderEmbedForTest`
  - `markdownMatrixInjector.insertEmbedFromPaste`
  - `markdownMatrixInjector.insertEmbedFromDrop`
- Manual reproduction path:
  1. Markdown ファイルを開く。
  2. `![[` を入力して補完候補を確認する。
  3. 存在しないファイル / シート / invalid XML を書いて Problems を確認する。
  4. コマンドパレットから Paste / Drop 入口コマンドを実行し、挿入結果を確認する。

## Failure triage
- `xvfb-run is required ...` で失敗した場合: OS パッケージ `xvfb` を導入する。
- VSCode ダウンロードや Electron 起動で失敗した場合: ネットワーク制約または GUI 依存ライブラリ不足を疑う。
- Completion が 0 件の場合: 対象文書が Markdown として開かれているか、カーソル位置が `![[`, `#`, `?` の直後かを確認する。
- Diagnostics が不足する場合: 一時 workspace の `data/invalid.xml` 作成と、対象 Markdown 文書保存内容を確認する。
- Paste / D&D 挿入が失敗する場合: 現段階では native paste/drop provider ではなく command 経由の検証である点を確認する。

## Known scope limits
- この E2E は Extension Host API レベルの検証であり、Markdown Preview / Webview の DOM までは検査しません。
- Paste / D&D は実環境制約上、OS ネイティブイベントではなく command 引数経由で再現しています。
- Problems パネル UI 自体の視覚確認は未自動化で、Diagnostics collection の内容を事実ベースで検証します。
