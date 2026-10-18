# 開発と検証

実装とテストは`03_Implement/`にあります。開発・検証にはNode.js、npm、Python 3を用意します。依存するバージョンと実行入口は[package.json](../03_Implement/package.json)で確認してください。

## 基本コマンド

作業ディレクトリを`03_Implement/`にして、次のコマンドを実行します。この節は実行手順であり、今回あらためてテストを実行した記録ではありません。

```sh
npm ci
npm run build
npm test
```

`npm test`では製品の単体テスト（`npm run test:unit`）とサンプル同期チェックを実行します。研究層のテストは別の`npm run test:research`で実行します。テストの区分は、`src/experimental/`を読み込むか、研究系のファイル名かによって決まります。対象一覧は`node scripts/run-test-lane.mjs product --list`で確認できます。

ドキュメントのみを変更する場合は、リンク・記法・説明の整合を確認し、変更内容に必要な検査に絞ります。

## VS Code連携

```sh
npm run test:e2e
```

`npm run test:e2e`はBashスクリプトを使用します。WindowsではWSL等の実行環境を用意します。ヘッドレスLinuxでは`xvfb-run`とElectronの実行依存が必要です。スクリプトはLFで保存してください。

環境が足りずに起動できない場合と、製品のテストが失敗した場合を区別して記録・報告します。

自動宿主テストだけでは、プレビュー内のクリック、外部アプリの起動、PDF出力まで確認したことにはなりません。これらは[E2E手順](vscode-e2e-testing.md)に沿って実機で確認します。

## 配布物

```sh
npm run build
npm run package
```

VSIXを対象のVS Codeにインストールし、バージョン・成果物・試験条件の対応を確認します。ローカルでのパッケージ作成とMarketplaceへの公開は、別の操作です。
