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
- VSCode Extension Host を実際に起動する最小拡張エントリーポイントと、`@vscode/test-electron` による統合テストハーネスを追加する。Docker/CI では `xvfb-run` を介して GUI 依存を吸収し、実レンダリング結果はコマンド経由の HTML 断面で検証する。Playwright を用いた DOM 検証は次段の拡張ポイントとして方式設計に明記する。

### Acceptance criteria (受入条件)
- [x] VSCode Extension Host 上で拡張を起動し、コマンド経由で MMI レンダリングを検証できること。
- [x] Docker / headless 環境向けに `xvfb-run` 前提の実行スクリプトが追加されていること。
- [x] 要件整理・方式設計・実装手順・運用手順が Architecture / Documentation に記録されていること。
- [x] 既存の unit テストと追加した E2E テスト、ビルドが通ること。

### Task breakdown (作業分解)
- [x] Extension Host 用の実装とテストハーネスを追加する。
- [x] npm scripts と headless 実行スクリプトを整備する。
- [x] Architecture / Documentation を追加する。

### Validation plan (検証計画)
- `cd 03_Implement && npm test` が Pass することを確認する。
- `cd 03_Implement && npm run test:e2e` が Pass することを確認する。
- `cd 03_Implement && npm run build` が成功することを確認する。
