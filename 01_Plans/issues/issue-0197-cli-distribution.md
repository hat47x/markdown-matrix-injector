# Issue: CLIをNode.jsの開発環境なしで使えるように配布する

## Meta
- Type: Feature
- Status: Draft
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
- [ ] 配布形態を決める。候補は、npmパッケージ（`npx`）、単一ファイルへのバンドル、VS Code拡張への同梱（拡張のフォルダーにある`dist/src/cli/mmi.js`を呼ぶ）。
- [ ] 選んだ形態で、開発環境の無いマシンから`mmi check`を実行できることを確かめる（Windows・Linux）。
- [ ] AI向け指示パックとキットのREADMEのコマンドを、配布形態に合わせて書き換える。
- [ ] `xlsx`の取得元とライセンスの扱いを確認し、記録する。

## Validation plan
新しい環境（WSLの別ユーザー等）で配布物だけを入れ、基本設計書キットに`mmi check`と`mmi render`を実行する。

## Remaining work
- MCPサーバーは、CLIだけで不足すると分かってから検討する（ADR-0019 D10）。
