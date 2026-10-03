# MMI CLI distribution

このディレクトリは、VS Code拡張とは別に配布するMMI CLIのnpm tarballを作るための正本です。

利用者に必要なのはNode.js 20以上と配布された`.tgz`です。リポジトリのcheckout、TypeScript、`npm ci`、MMIのbuildは不要です。runtime依存もtarballへ同梱するため、配布物のインストール時にSheetJS CDNやnpm registryからMMIの依存packageを取得することを前提にしません。

## 配布物を作る

開発環境では`03_Implement`で次を実行します。

```sh
npm run package:cli
```

`npm run build`の後、compiled CLI entryから相対module依存を再帰追跡し、CLIから到達できるruntime moduleだけを`artifacts/cli-package-stage/`へ組み立てます。production依存はリポジトリの`package-lock.json`に固定されたgraphを`npm ci --omit=dev`で導入し、npmの`bundleDependencies`を使って1つの`.tgz`へまとめます。成果物とSHA-256は`artifacts/cli-package/`へ出力します。stageはpack後に削除します。

配布artifactには、CLIから到達するコンパイル済みMMI runtime、`markdown-it`、SheetJS CE、プレビュー用CSS、MMIのLICENSE、第三者ライセンス表示を含めます。VS Code extension entry、experimental code、開発依存、TypeScript source、test、計画文書は通常のpackage内容に含めません。相対moduleが見つからない場合やcompiled root外を参照する場合はpack前に失敗します。

生成したtarballは、その場で空の専用npm cacheを使った`npm install --offline`へ通します。インストールした`mmi`で`--help`、`--version`、`check`、`render`を実行し、いずれかが失敗した場合は`package:cli`自体を失敗させます。

## 利用する

ローカルまたは社内配布されたtarballはnpmで直接インストールできます。

```sh
npm install -g ./markdown-matrix-injector-0.1.0.tgz
mmi --help
mmi --version
mmi check docs/ --root .
```

一時利用ではnpm package specとしてtarballを指定できます。

```sh
npm exec --yes --package ./markdown-matrix-injector-0.1.0.tgz -- \
  mmi check docs/ --root .
```

将来npm registryへ公開する場合も、CLIのpackage contractと`mmi` binaryは同じものを使います。registry公開はこのIssueの初期配布成立条件には含めません。

## 境界

- Node.js 20以上のruntimeは必要です。
- CLI tarballはVS Code拡張を置き換えません。GUI、プレビュー統合、CandidateレビューUI等はVS Code拡張の役割です。
- CLIは元データを読み取り専用で扱う原則を維持します。`extract`、`import`、`materialize`等の明示的な出力操作だけが利用者指定の成果物へ書き込みます。
- `package:cli`の自己検証は生成したOS上のsmokeです。WindowsとLinuxでの新規環境manual-e2eは、同じ配布artifactを使って別途実施します。
