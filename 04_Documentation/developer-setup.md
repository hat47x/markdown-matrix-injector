# Developer Setup

## 実装コードの場所
- 実装本体: `03_Implement/src/`
- テスト: `03_Implement/test/`
- Node / TypeScript 設定: `03_Implement/package.json`, `03_Implement/tsconfig.json`, `03_Implement/.gitignore`

## まず入れておく依存関係
Phase 5 の VSCode 連携確認では、単なる `npm install` だけでなく、**host 側で Extension Host を起動できること** と **headless 実行に必要な表示系依存がそろっていること** が前提になります。

### 必須
- Node.js / npm
- VSCode 本体（manual 確認で Extension Development Host を起動できる host）
- `03_Implement` 配下の npm 依存 (`npm install`)

### headless E2E 用
- `xvfb-run`
- Electron / VSCode が headless 起動時に必要とする基本ライブラリ群

Debian / Ubuntu 系の例:
```bash
sudo apt-get update
sudo apt-get install -y xvfb libgtk-3-0 libnss3 libxss1 libasound2
```

> `npm run test:e2e` は内部で VSCode Extension Host を起動します。GUI を持たない Linux / container 環境では、通常 `xvfb-run` が無いと開始地点に立てません。

## 開発コマンド
```bash
cd 03_Implement
npm install
npm test
npm run build
npm run test:e2e
```

## Phase 5 に入る前の理解ポイント
Phase 5 の native provider / fallback 確認は、次の 3 つを分けて考えると迷いません。

1. **ビルド前提**: `npm run build` で拡張を最新状態にする。
2. **自動 E2E 前提**: `npm run test:e2e` が `xvfb-run` 経由で VSCode Extension Host を headless 起動できる。
3. **手動確認前提**: ホスト OS 上の VSCode で Extension Development Host を起動し、native paste / drop や Preview / Problems を実機確認できる。

## 自動確認の入口
Extension Host ベースの自動確認を行うときは、まず次を実行します。

```bash
cd 03_Implement
npm run build
npm run test:e2e
```

この入口で確認する対象:
- VSCode Extension Host が起動できること
- headless 環境でも E2E ハーネスが開始できること
- 補完 / Diagnostics / command fallback / native provider adapter の自動確認が走ること

## 手動確認の入口
次のような項目は、自動 E2E だけでは完結しません。

- Markdown Preview 上の見た目
- Problems パネルの見え方
- VSCode Suggest UI の操作感
- OS ネイティブの paste / drag-and-drop が実際にどう振る舞うか

そのため、manual 確認に入る前提として以下を満たしてください。

1. ホスト OS の VSCode でリポジトリを開けること。
2. `cd 03_Implement && npm install && npm run build` が完了していること。
3. VSCode の `Run Extension` などを使って **Extension Development Host** を起動できること。
4. native paste / drop を試す場合、clipboard / file drag-and-drop を実際に発火できるローカル host であること。

> manual E2E の詳細手順やチェックリストは `04_Documentation/vscode-e2e-testing.md` に分離しています。本書では環境準備と実行入口だけを扱い、Preview / Problems / native event の詳細手順はそちらへ委譲します。

## Phase 5 / VSCode integration の進め方
1. `cd 03_Implement && npm install`
2. `cd 03_Implement && npm run build`
3. headless 自動確認が必要なら `cd 03_Implement && npm run test:e2e`
4. Preview / Problems / native paste / native drop の最終確認が必要なら、ホスト VSCode で Extension Development Host を起動する。
5. 手動で「何を見ればよいか」は `04_Documentation/vscode-e2e-testing.md` の manual checklist を参照する。

## テストデータ方針
- Excel / Spreadsheet 系のテストデータはリポジトリへ固定ファイルとして追加せず、ユニットテスト内で都度生成する。
- VSCode E2E は既存 fixture workspace を一時コピーし、必要な追加ファイル（例: invalid XML）だけを実行時に生成する。
