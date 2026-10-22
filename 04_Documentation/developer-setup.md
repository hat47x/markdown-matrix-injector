# 開発と検証

実装とテストは`03_Implement/`にあります。開発・検証にはNode.js、npm、Python 3を用意します。依存するバージョンと実行入口は[package.json](../03_Implement/package.json)で確認してください。

## 基本コマンド

作業ディレクトリを`03_Implement/`にして、次のコマンドを実行します。この節は実行手順であり、今回あらためてテストを実行した記録ではありません。

```sh
npm ci
npm run build
npm test
```

`npm test`は、`package.json`で定義された次の6つのスクリプトを、この順序で実行します。

1. `npm run test:unit`：製品の単体テスト。
2. `npm run test:candidate-review-product-baseline`：Candidate Reviewの製品ベースラインテスト。
3. `npm run test:cli-distribution`：CLI配布テスト。
4. `npm run test:release-candidate`：リリース候補の検査（版の整合、VSIXの監査等）の単体テスト。
5. `npm run test:phase9-sync`：Phase 9テンプレート同期チェック。
6. `npm run test:phase9-guide-sync`：Phase 9ガイド同期チェック。

各スクリプトは`&&`でつながっており、途中で失敗した場合は後続を実行しません。研究層のテストは別の`npm run test:research`で実行します。テストの区分は、`src/experimental/`を読み込むか、研究系のファイル名かによって決まります。対象一覧は`node scripts/run-test-lane.mjs product --list`で確認できます。

Pythonを使うスクリプトは`scripts/run-python.mjs`を通して起動し、`python3`・`python`・`py -3`の順に動くものを使います。Windowsでは`python3`がMicrosoft Storeの案内用スタブのことがあり、そのままでは`npm test`が失敗するためです。

Windowsでファイルのシンボリックリンクを作れない場合（開発者モードが無効など）、リンクを使うテストはskipになります。失敗ではありません。WSLで導入した`node_modules`はLinux向けの実行ファイルを含むため、Windowsで動かすときは`npm ci`をWindows側でやり直します。

ドキュメントのみを変更する場合は、リンク・記法・説明の整合を確認し、変更内容に必要な検査に絞ります。

## VS Code連携

```sh
npm run test:e2e
```

`npm run test:e2e`はBashスクリプトを使用します。ヘッドレスLinuxでは`xvfb-run`とElectronの実行依存が必要です。スクリプトはLFで保存してください。Windowsでは、`npm run build`の後に次のコマンドで同じテストを直接起動できます（初回はVS Codeを取得します）。

```sh
MMI_ENABLE_TEST_COMMANDS=1 node --import tsx ./test/e2e/runTest.ts
```

デスクトップのクリップボードを別のプロセスが使っていると、クリップボードに依存する段階は`skipped`（`environment-prerequisite`）と記録されます。製品の失敗としては数えません。

環境が足りずに起動できない場合と、製品のテストが失敗した場合を区別して記録・報告します。

自動宿主テストだけでは、プレビュー内のクリック、外部アプリの起動、PDF出力まで確認したことにはなりません。これらは[E2E手順](vscode-e2e-testing.md)に沿って実機で確認します。

## リリース候補

配る成果物は、次のコマンドで一つのコミットから作ります（[ADR-0025](../01_Plans/adr/ADR-0025-release-candidate-evidence-and-channels.md)）。

```sh
npm run release:candidate            # 版の整合、全体の型検査、製品テスト、VSIXの作成と監査、CLIのoffline導入確認
npm run release:candidate -- --e2e   # Extension Host E2Eを、開発中のフォルダーと展開したVSIXの両方で実行する
```

`--vscode-version <x.y.z>`を付けると、E2Eに使うVS Codeの版を固定し、その版を証拠に記録します。付けない場合はstableを使います。

結果は`artifacts/release/<version>/`に出ます。VSIX、CLI tarball、`SHA256SUMS`、`RELEASE_NOTES.md`、`release-evidence.json`の5種類です。未コミットの変更があると失敗します。`--allow-dirty`を付けると予行演習として最後まで実行しますが、その候補は常にリリース不可と記録されます。

版を上げるときは、`package.json`の`version`と、`package-lock.json`の`version`（先頭と`packages[""]`の2か所）を書き換え、CHANGELOGに日付付きの節を書きます。npm 11の`npm version`は、lockfileから実行時の依存（`yaml`）を落とすことがあったため使いません。READMEの最低対応VS Codeは`engines.vscode`と一致させます。どれかがずれていると、`release:candidate`は最初の検査で止まります。

`release-evidence.json`の`manualChecks`には、ADR-0010のG1〜G4など、人が実機で見る確認が`not-run`として並びます。自動の検査に合格しても、これらは確認済みになりません。実機で確かめたら、版とSHA-256を添えて検証記録に残します。タグ・GitHub Release・Marketplaceへの公開は、Human Sponsorが行う別の操作です。

CI（`.github/workflows/ci.yml`）も同じコマンドを呼びます。jobは、リポジトリ変数`MMI_ACTIONS_ENABLED`が`true`のときだけ動きます。手動で起動するRelease Candidate workflow（`.github/workflows/release-bundle.yml`）は、E2Eも含めた候補をheadlessのLinuxで作ります。入力`vscode-version`に`1.100.0`（`engines.vscode`の下限）を指定すると、最低対応版での確認になります。
