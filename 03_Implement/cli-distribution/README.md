# MMI CLI distribution

このディレクトリは、VS Code拡張とは別に配布するMMI CLIのnpm tarballを作るための正本です。

利用者に必要なのはNode.js 20以上と配布された`.tgz`です。Node 20未満で`mmi`を起動した場合は、SheetJS等のruntime依存を読み込む前に必要versionを明示して終了します。リポジトリのcheckout、TypeScript、`npm ci`、MMIのbuildは不要です。runtime依存もtarballへ同梱するため、配布物のインストール時にSheetJS CDNやnpm registryからMMIの依存packageを取得することを前提にしません。

## 配布物を作る

開発環境では`03_Implement`で次を実行します。

```sh
npm run package:cli
```

`npm run build`の後、compiled CLI entryから相対module依存を再帰追跡し、CLIから到達できるruntime moduleだけを`artifacts/cli-package-stage/`へ組み立てます。production依存はリポジトリの`package-lock.json`に固定されたgraphを`npm ci --omit=dev`で導入し、npmの`bundleDependencies`を使って1つの`.tgz`へまとめます。成果物とSHA-256は`artifacts/cli-package/`へ出力します。stageはpack後に削除します。pack後のoffline smokeでは、`mmi schema candidate` / `ledger` / `review-decisions`で3つの公開契約を取得できること、表の`check` / `render`、JSON / XML / YAML Treeと静的HTMLの`inspect` / `extract`、複数断片の読み取り専用`html-plan`、共通ledgerへの記録を確認します。

配布artifactには、CLIから到達するコンパイル済みMMI runtime、`markdown-it`、HTML5解析用`parse5`（および依存する`entities`）、SheetJS CE、プレビュー用CSS、MMIのLICENSE、第三者ライセンス表示を含めます。VS Code extension entry、experimental code、開発依存、TypeScript source、test、計画文書は通常のpackage内容に含めません。相対moduleが見つからない場合やcompiled root外を参照する場合はpack前に失敗します。

生成したtarballは、その場で空の専用npm cacheを使った`npm install --offline`へ通します。インストールした`mmi`で`--help`、`--version`、3種の`schema`、`check`、`render`、JSON / XML / YAML Treeと静的HTMLの`inspect` / `extract`、`html-plan`を実行し、いずれかが失敗した場合は`package:cli`自体を失敗させます。

## 利用する

ローカルまたは社内配布されたtarballはnpmで直接インストールできます。

```sh
npm install -g ./markdown-matrix-injector-0.2.0.tgz
mmi --help
mmi --version
mmi --version --json   # コミット・lockfile digest・Node.js版・提供形態（mmi.build-identity/v1）
mmi check docs/ --root .
```

一時利用ではnpm package specとしてtarballを指定できます。

```sh
npm exec --yes --package ./markdown-matrix-injector-0.2.0.tgz -- \
  mmi check docs/ --root .
```

将来npm registryへ公開する場合も、CLIのpackage contractと`mmi` binaryは同じものを使います。registry公開はこのIssueの初期配布成立条件には含めません。

## 境界

- Node.js 20以上のruntimeは必要です。
- CLI tarballはVS Code拡張を置き換えません。GUI、プレビュー統合、CandidateレビューUI等はVS Code拡張の役割です。
- CLIは元データを読み取り専用で扱う原則を維持します。`extract`、`import`、`materialize`等の明示的な出力操作だけが利用者指定の成果物へ書き込みます。
- `package:cli`の自己検証は生成したOS上のsmokeです。WindowsとLinuxでの新規環境manual-e2eは、同じ配布artifactを使って別途実施します。

## HTML断片対応の配布上の注意（PR #555）

HTML5の`inspect`、単一断片の`extract --html-id`、複数断片の読み取り専用`html-plan`は、CLIのruntimeで`parse5`を必要とします。TypeScriptのimportが存在しても、standalone CLIのtarballに依存物が同梱されていなければ、利用者環境で起動時に失敗します。そのため配布manifestの必須runtime依存にも`parse5@7.3.0`を含め、既存`cliDistribution.test.mjs`で脱落を拒否するようにします。

**検証状態**: 2026-10-17のLinux / Node.js 20.20.2で`npm run package:cli`と`node scripts/verify-cli-package.mjs artifacts/cli-package/markdown-matrix-injector-0.1.0.tgz`を実行した。空のnpm cacheを使ったinstallで`isolatedOfflineInstall`と`bin` / `help` / `version`、3種の`schema`、`check` / `render`、Treeの`inspect` / `extract`、そして`htmlInspect` / `htmlPlan` / `htmlExtract` / `htmlLedger`がpassedである。Windows等の他OSでの新規環境manual-e2eは未実施であり、その範囲は受入済みとしない。
