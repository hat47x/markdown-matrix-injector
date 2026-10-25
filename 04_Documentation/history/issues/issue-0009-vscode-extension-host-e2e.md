# Issue: VS Code Extension Hostを使うE2E検証基盤を整える

この文書は、当時の提案と完了状態を残したIssue記録です。以下の受入条件と検証計画は当時の内容を示しており、現在の実装や後年の判断を新たに確認・更新するものではありません。

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: `02_Architecture`, `03_Implement`, `04_Documentation`
- Expected verification level: integration

## Traceability
- Related Backlog/Phase: Phase 5: 開発者体験と品質保証 (DX & Diagnostics)
- Related ADR/Spec: `00_Prompt/requirements.md`

## 当時の実行計画
### 解決方針（当時の提案）
- VS Codeの拡張機能を動かすExtension Hostを実際に起動できる最小限の入口と、`@vscode/test-electron`を使った統合テスト基盤を追加する。Docker/CIでは`xvfb-run`を介して画面表示環境への依存に対応し、描画結果はコマンドから取得するHTMLの一部分で検証する。PlaywrightによるDOM検証は、次の段階で拡張する対象として方式設計に記載する。

### 受入条件
- [x] VSCode Extension Host上で拡張を起動し、コマンド経由でMMIレンダリングを検証できること。
- [x] Docker / headless環境向けに `xvfb-run` 前提の実行スクリプトが追加されていること。
- [x] 要件整理・方式設計・実装手順・運用手順がArchitecture / Documentationに記録されていること。
- [x] 既存のunitテストと追加したE2Eテスト、ビルドが通ること。

### 作業項目
- [x] Extension Host用の実装とテストハーネスを追加する。
- [x] npm scriptsとheadless実行スクリプトを整備する。
- [x] Architecture / Documentationを追加する。

### 当時の検証計画
- `cd 03_Implement && npm test` がPassすることを確認する。
- `cd 03_Implement && npm run test:e2e` がPassすることを確認する。
- `cd 03_Implement && npm run build` が成功することを確認する。
