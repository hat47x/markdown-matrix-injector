# Issue: CLIをNode.jsの開発環境なしで使えるように配布する

## Meta
- Type: Feature
- Status: In Progress
- Priority: Medium
- Scope: 03_Implement（package.json、バンドル）、docs、skills/mmi
- Expected verification level: manual-e2e

## Traceability
- Related ADR/Spec: ADR-0019 D10・D11（優先度1）
- Related analysis: [製品価値と現行実装のギャップ](../product-gap-analysis.md) §2「AI/CI利用」、§4
- Dependency: なし

## 背景

CLI（`inspect`・`check`・`render`・`manifest`）は実装済みだが、現在はリポジトリの`03_Implement`で`npm ci`と`npm run build`を済ませた利用者しか使えない。AIエージェントの利用者に開発環境を求めると、「依頼するだけで使える」状態にならない。依存の`xlsx`はCDNのtarballを指しており、npmでの公開に障害がある可能性がある。

## Acceptance criteria
- [x] 配布形態を決める。第一段はNode.js 20以上で動くnpm互換の自己完結tarballとする。runtime依存を`bundleDependencies`で同梱し、利用者にリポジトリcheckout・TypeScript・`npm ci`・buildを要求しない。npm registry公開は同じpackage contractで後から追加できるが、初期成立条件にはしない。
- [ ] 選んだ形態で、開発環境の無いマシンから`mmi check`を実行できることを確かめる（Windows・Linux）。
- [x] AI向け指示パック、AIエージェント向け手引き、基本設計書キット、利用マニュアルを配布tarballの`mmi`コマンドを第一経路として更新する。開発checkout向けの`npm run mmi -- ...`はfallbackとして残す。
- [x] `xlsx` 0.20.3の正本取得元をSheetJS公式CDN（`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`）と確認した。SheetJS CEはApache-2.0で、配布時のattributionとライセンス表示保持が必要である。CLI artifactは依存packageを改変せず同梱し、`THIRD_PARTY_NOTICES.md`を添付する。

## Implementation checkpoint (2026-10-03)

`03_Implement/scripts/build-cli-package.mjs`を追加した。通常のVS Code拡張manifestをそのままnpmへ公開せず、build済みCLI entryからTypeScript ASTで相対`import` / `export` / dynamic `import()` / `require()`を再帰追跡し、到達可能なruntime moduleだけをCLI専用stageへ投影する。欠落moduleやcompiled root外への相対依存はfail-closedとする。プレビューCSS、MMIのLICENSE、第三者noticeは明示的に追加し、生成manifestの`files` allowlistで`dist`、`media`、README、LICENSE、notice以外を通常package内容から除外する。生成manifestは`bin.mmi=./dist/src/cli/mmi.js`、`engines.node>=20`とし、production runtimeは`markdown-it`とSheetJS CEだけに限定する。

stageではリポジトリの`package-lock.json`と通常manifestを一時的に使い、`npm ci --omit=dev`で検証済みlockfileのproduction graphをそのまま導入する。その後CLI専用manifestへ戻し、`bundleDependencies: true`で1つのtarballへ含める。これにより利用者がローカルtarballを導入するとき、MMI runtime dependencyの再取得を前提にしない。buildはtarballとSHA-256 sidecarを`artifacts/cli-package/`へ出力する。

`scripts/verify-cli-package.mjs`は、新しい一時prefixと空の専用npm cacheを作り、tarballを`npm install --offline`する。既存cacheから不足依存を補えないため、runtime dependencyの同梱漏れを検出できる。導入後は生成された`mmi` binaryで`--help`、`--version`、`check`、`render`を実行し、`--version`がインストール済みpackage.jsonのversionと一致することも確認する。`npm run package:cli`はtarball生成直後にこの検証を自動実行し、検証失敗時は`.tgz`とSHA-256 sidecarを削除するため、未検証artifactを配布対象として残さない。LinuxとWindowsで同じ検証手順を使えるが、本Issueのmanual-e2eとしての両OS実行はまだ行っていない。

`test/cliDistribution.test.mjs`では、CLI packageがVS Code固有の`main`、`publisher`、`contributes`を持ち込まないこと、runtime dependencyとpackage file allowlistが限定されること、bootstrapから到達するmoduleだけがstageへ入りextension/experimental codeが混入しないこと、コメントや文字列中の疑似importを依存と誤認しないこと、欠落module・root外import・compiled bootstrap欠落でfail-closedになることを回帰として追加した。`cli.test.ts`には`mmi --version` / `-v`とpackage metadataの一致確認を追加した。`cliBootstrap.test.ts`ではNode 18/19を拒否し、20以上を許可するversion gateと、非対応Nodeでruntime graphを読み込まずexit 2になることを固定した。

## Linuxでの実測（2026-10-06）

最新の`main`（`6fba0dd`）で`npm run package:cli`を実行した（WSL2、Node 20.20.2）。

- **既存の不具合を修正した。** `package:cli`は最初に`npm run build`（`tsc -p tsconfig.json`）を実行するが、`tsconfig.json`は`test/**`と研究層も含むため、型エラーが残ると配布物が作れなかった。最新の`main`では、`saxes`導入時に`xmlTreeAdapter.ts`から型定義が落ちたこと、`aiHandoffTransformationValidation.ts`の`CHECK_ORDER`が未定義のまま使われていたこと、`inspect`の汎用XML分岐に`choiceLists`等が無いこと等、**product側にも型エラーが55件あった**（`npm ci`済みの環境）。product側を直し、さらに`package:cli`が使うビルドを`tsconfig.product.json`（`src`のうち研究層を除く）の`build:product`へ切り替えた。`npm run build`（全体）は、研究層・凍結テストの既存の型エラー17件が残るため、引き続き失敗する。凍結テストは固定されたダイジェストを検証するので、型エラーのために編集しない。
- 生成: `artifacts/cli-package/markdown-matrix-injector-0.1.0.tgz`（約3.3MB、`bundleDependencies`込み）。生成直後の隔離検証（新しいprefix、空のnpm cache、`--offline`）は16項目すべて`passed`（`help`・`version`・`check`・`render`・JSON/XML/YAMLのTree `inspect`/`extract`/ledgerを含む）。
- 修正の効果: product側の型・実行時の不具合を直したところ、全体テストの失敗が77件から61件に減り、16件のテスト（CLIの`inspect`/`extract`、AI手渡しの検証等）が合格に変わった。新しい失敗は0件（変更前の`origin/main`と、失敗するテスト名を比較）。
- Node 18で実行すると、従来はSheetJSを読み込んだ後に`SyntaxError`へ落ち、必要なNode版が利用者に伝わらなかった。2026-10-07に`src/cli/bootstrap.ts`を追加し、配布`bin`をbootstrapへ変更した。bootstrapはproduct/runtime依存を静的importせず、Node 20未満なら本体を読み込む前に「Node.js 20 or newer is required」と現在versionを表示してexit 2にする。Node 20以上でのみ`mmi.js`をdynamic importする。runtime graph収集もbootstrapを起点にするため、本体moduleの同梱は維持される。

## Windowsでの実測（2026-10-15）

最新`main`のコード（`bc65c1d`）からWSL2（Node 20.20.2）で`npm run package:cli`を実行し、生成直後の隔離検証がすべて`passed`であることを確認した。続けて、同じtarball（約3.3MB、sha256は`.sha256`ファイルと一致）をリポジトリの外の新しいフォルダーへコピーし、Windows 11（Node 24.21.0、npm 11.19.0）で次を実行した。

- 新しいprefixと空のnpm cacheへ、`npm install --offline --ignore-scripts`で導入できた。`node_modules\.bin\mmi.cmd`が作られた。
- `mmi --version`は`0.1.0`を表示し、終了コードは0だった。
- 基本設計書キットのコピーに対する`mmi check`は`0 error(s), 0 other problem(s)`、終了コードは0だった。
- キットの本文に対する`mmi render`は、`masters/基本設計.xlsx`の表をGFMとして出力し、終了コードは0だった。
- WSL2の`/usr/bin/node`（18.19.1）でbootstrapを実行すると、標準エラーに「Node.js 20 or newer is required; current runtime is 18.19.1.」を出し、終了コードは2、標準出力は空だった。

この確認には限界がある。導入したのは同じPC上の別フォルダー・空のcacheであり、開発環境の無い別のマシンではない。WindowsのNodeは20ではなく24.21.0である。Windows上のNode 20とmacOSは未実施である。

## Validation plan

`npm run package:cli`で配布tarballを作り、WindowsとLinuxの新規環境で次を実行する。開発用checkoutやTypeScript toolchainは置かない。

```sh
npm install -g ./markdown-matrix-injector-<version>.tgz
mmi --version
mmi check <basic-design-kit> --root <basic-design-kit>
mmi render <basic-design-kit>/基本設計書.md --root <basic-design-kit>
```

`npm run package:cli`自体が生成ホストでisolated offline smokeまで実行する。加えて、同じtarballをWindows・Linuxの新規環境へ移し、`npm run verify:cli-package -- <tarball>`または同等のglobal install確認で、offline install、binary生成、version一致、`check`、`render`が通ることを記録する。

## Remaining work

- 開発環境の無い別のWindowsマシンで、Node 20を使って同じmanual-e2eを繰り返す。Node 24での導入・`check`・`render`と、Node 18でのversion error（本体依存を読む前に停止）は、2026-10-15に確認した。macOSは未実施である。開発環境の無いマシンで確認するまで「開発環境なしで両OS検証済み」とは扱わない。
- npm registryへの公開名・公開時期は、tarball配布の実測後に決める。tarball自体はregistryなしでも配布できる。
- MCPサーバーは、CLIだけで不足すると分かってから検討する（ADR-0019 D10）。
