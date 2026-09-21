# 開発と検証

実装とテストは`03_Implement/`にあります。Node.js、npm、Python 3を用意してください。依存版と実行入口は[package.json](../03_Implement/package.json)を確認します。

## 基本コマンド

`03_Implement/`で実行します。

```sh
npm ci
npm run build
npm test
```

`npm test`はNodeの単体テストとサンプル同期チェックを実行します。ドキュメントだけの変更では、リンク・記法・説明の整合を確認し、必要な検査に絞ります。

## VS Code連携

```sh
npm run test:e2e
```

この入口はBashスクリプトを使用します。WindowsではWSL等の実行環境を用意し、ヘッドレスLinuxでは`xvfb-run`とElectronの実行依存が必要です。スクリプトはLFで保存します。環境不足と製品のテスト失敗を分けて報告してください。

自動宿主テストだけでは、プレビュー内のクリックや外部アプリ起動、PDF出力の確認は完了しません。[E2E手順](vscode-e2e-testing.md)に沿って実機で確認します。

## 配布物

```sh
npm run build
npm run package
```

VSIXを対象VS Codeへインストールし、版・成果物・試験条件を対応付けて確認します。Marketplaceへの公開はローカルのパッケージ作成とは別の操作です。
