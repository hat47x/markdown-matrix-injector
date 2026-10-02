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

`03_Implement/scripts/build-cli-package.mjs`を追加した。通常のVS Code拡張manifestをそのままnpmへ公開せず、build済み`dist/src`、プレビューCSS、MMIのLICENSE、第三者noticeだけをCLI専用stageへ投影する。生成manifestは`bin.mmi=./dist/src/cli/mmi.js`、`engines.node>=20`とし、production runtimeは`markdown-it`とSheetJS CEだけに限定する。

stageではproduction依存を導入し、npmの`bundleDependencies: true`で1つのtarballへ含める。これにより利用者がローカルtarballを導入するとき、MMI runtime dependencyの再取得を前提にしない。buildはtarballとSHA-256 sidecarを`artifacts/cli-package/`へ出力する。

`scripts/verify-cli-package.mjs`は、新しい一時prefixへtarballを`npm install --offline`し、生成された`mmi` binaryで`--help`、`check`、`render`を実行する。offline installが失敗すればruntime dependencyの同梱不足として検出できる。LinuxとWindowsの同じ検証手順を使えるが、本Issueのmanual-e2eとしての両OS実行はまだ行っていない。

`test/cliDistribution.test.mjs`では、CLI packageがVS Code固有の`main`、`publisher`、`contributes`を持ち込まないこと、runtime dependencyが限定されること、compiled CLIや必要なnoticeがstageへ入ること、compiled entryが無い場合にfail-closedになることを固定した。

## Validation plan

`npm run package:cli`で配布tarballを作り、WindowsとLinuxの新規環境で次を実行する。開発用checkoutやTypeScript toolchainは置かない。

```sh
npm install -g ./markdown-matrix-injector-<version>.tgz
mmi check <basic-design-kit> --root <basic-design-kit>
mmi render <basic-design-kit>/基本設計書.md --root <basic-design-kit>
```

さらに`npm run verify:cli-package -- <tarball>`を各OSで実行し、offline install、binary生成、`check`、`render`が通ることを記録する。

## Remaining work

- 実際のtarballを生成し、Windows・Linuxの新規環境でmanual-e2eを実施する。これが終わるまで「開発環境なしで検証済み」とは扱わない。
- npm registryへの公開名・公開時期は、tarball配布の実測後に決める。tarball自体はregistryなしでも配布できる。
- MCPサーバーは、CLIだけで不足すると分かってから検討する（ADR-0019 D10）。
