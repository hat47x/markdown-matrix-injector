# VSCode Engine E2E Testing Guide

## Overview
Markdown Matrix Injector では、Docker コンテナ内でも VSCode Extension Host を起動した自動検証を行えるようにしました。人手による画面操作ではなく、CLI から `@vscode/test-electron` を起動し、拡張コマンド経由で HTML 出力を検証します。

## Prerequisites
- Node.js / npm
- `xvfb-run` (Ubuntu 系では `sudo apt-get install -y xvfb`)
- Electron が利用する基本ライブラリ群

## Commands
```bash
cd 03_Implement
npm install
npm test
npm run test:e2e
npm run build
```

## What `npm run test:e2e` does
1. `scripts/run-vscode-e2e.sh` が `xvfb-run` の存在を確認する。
2. 仮想ディスプレイ上で `test/e2e/runTest.ts` を起動する。
3. `@vscode/test-electron` が VSCode を取得し、開発中の拡張を読み込んだ Extension Host を立ち上げる。
4. Integration suite が `markdownMatrixInjector.renderEmbedForTest` コマンドを実行し、HTML 断面を検証する。

## Current assertions
- CSV 埋め込みが実際の VSCode Engine 上で `<table class="mmi-table">` へ変換されること。
- Smart Fallback により wide table が `<div class="mmi-card">` に縮退すること。

## Next step for DOM / Preview validation
将来的に Markdown Preview / Webview の DOM を直接検証する場合は、Extension Host 側に「プレビューを開くテストコマンド」を追加し、そのウィンドウを Playwright から捕捉して `iframe` 内の `table`, `tr`, `figcaption`, `mmi-card` を検査します。本リポジトリではその前段として、まず VSCode エンジン上で HTML 生成が正しいことを自動確認できるようにしています。
