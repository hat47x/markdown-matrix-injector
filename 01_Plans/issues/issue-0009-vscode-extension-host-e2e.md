# Issue: Add VSCode Extension Host based E2E verification scaffold

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: `02_Architecture`, `03_Implement`, `04_Documentation`
- Expected verification level: integration

## Traceability
- Related Backlog/Phase: Phase 5: 開発者体験と品質保証 (DX & Diagnostics)
- Related ADR/Spec: `00_Prompt/requirements.md`

## Execution Plan
### Proposed solution (解決策の概要)
- VSCode Extension Hostを実際に起動する最小拡張エントリーポイントと、`@vscode/test-electron` による統合テストハーネスを追加する。Docker/CIでは `xvfb-run` を介してGUI依存を吸収し、実レンダリング結果はコマンド経由のHTML断面で検証する。Playwrightを用いたDOM検証は次段の拡張ポイントとして方式設計に明記する。

### Acceptance criteria (受入条件)
- [x] VSCode Extension Host上で拡張を起動し、コマンド経由でMMIレンダリングを検証できること。
- [x] Docker / headless環境向けに `xvfb-run` 前提の実行スクリプトが追加されていること。
- [x] 要件整理・方式設計・実装手順・運用手順がArchitecture / Documentationに記録されていること。
- [x] 既存のunitテストと追加したE2Eテスト、ビルドが通ること。

### Task breakdown (作業分解)
- [x] Extension Host用の実装とテストハーネスを追加する。
- [x] npm scriptsとheadless実行スクリプトを整備する。
- [x] Architecture / Documentationを追加する。

### Validation plan (検証計画)
- `cd 03_Implement && npm test` がPassすることを確認する。
- `cd 03_Implement && npm run test:e2e` がPassすることを確認する。
- `cd 03_Implement && npm run build` が成功することを確認する。
