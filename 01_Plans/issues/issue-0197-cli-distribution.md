# Issue: CLIをNode.jsの開発環境なしで使えるように配布する

## Meta
- Type: Feature
- Status: In Progress（Node.js 20だけで動く単一ファイルのパッケージを作成・Linuxで検証済み。npm公開、名前、Windows/macOSでの確認が残り）
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
- [x] 配布形態を決める。候補は、npmパッケージ（`npx`）、単一ファイルへのバンドル、VS Code拡張への同梱（拡張のフォルダーにある`dist/src/cli/mmi.js`を呼ぶ）。→ 当面は単一ファイルのバンドル（`mmi.mjs`）を、tarballとしても配れる形にした。VS Code拡張への同梱は`dist/src/cli/mmi.js`が`node_modules`を必要とするため、バンドルを同梱する形に移すまで見送る。
- [ ] 選んだ形態で、開発環境の無いマシンから`mmi check`を実行できることを確かめる（Windows・Linux）。→ Linux（WSL2、Node 20）で、`node_modules`の無いフォルダーおよびtarballをインストールした場所から確認済み。Windows・macOSは未確認（この調査環境にNode.jsが無い）。
- [x] AI向け指示パックとキットのREADMEのコマンドを、配布形態に合わせて書き換える。
- [x] `xlsx`の取得元とライセンスの扱いを確認し、記録する。→ xlsxはSheetJS CE 0.20.3（Apache-2.0、CDNのtarball）。バンドルに取り込み、`THIRD_PARTY_NOTICES.md`にxlsxとmarkdown-itのライセンスを同梱する。取り込み済みなので、配布物はCDNに依存しない。

## Validation plan
新しい環境（WSLの別ユーザー等）で配布物だけを入れ、基本設計書キットに`mmi check`と`mmi render`を実行する。

## 結果（2026-10-02）
- `npm run build:cli`（`scripts/build-cli.mjs`）が`dist-cli/package/`を作る。中身は`mmi.mjs`（約1.5MB）、`media/markdown-matrix.css`、`LICENSE`、`THIRD_PARTY_NOTICES.md`、依存ゼロの`package.json`（`bin: mmi`）。`npm pack`で約360KBのtarballになる。esbuildは`devDependencies`に明示した（`package-lock.json`も整合。`npm ci --dry-run`成功）。
- `npm run test:cli-bundle`（`scripts/smoke-cli-bundle.mjs`）が、`node_modules`の無い新しいフォルダーで`check`・`inspect`・`render`（md/html）・`materialize`・`detach-check`を実行する。全9項目が通る。tarballを空のプロジェクトへ`npm install`し、`.bin/mmi`から`check`が通ることも確認した。
- 単一ファイルに固めたときに見つかった不具合を直した: `render --to html`が、配布物の配置ではスタイルシートを見つけられず、気づかないまま無装飾のHTMLを出していた。探す場所を増やし、見つからないときは警告を出す。`package.json`の`mmi`スクリプトの重複キーも整理した。
- 検索ワーカー（`find`・VS Codeの検索）と研究層はCLIのバンドルに含まれない。

## Remaining work
- Windows・macOSでの実行確認。
- npmレジストリへの公開と、パッケージ名・CLI名。名前は[issue-0201](issue-0201-product-name-and-compatibility-layer.md)の決定後。現在の`markdown-matrix-injector-cli`は仮名で、`private: true`にして誤公開を防いでいる。
- VS Code拡張のvsixにバンドルを同梱し、拡張から呼べるようにする。
- 将来のportable core（[issue-0203](issue-0203-portable-core-minimum-binary.md)）で配布物をさらに小さくする場合、本Issueのスモークテストを同じ契約の確認に流用できる。
- MCPサーバーは、CLIだけで不足すると分かってから検討する（ADR-0019 D10）。
