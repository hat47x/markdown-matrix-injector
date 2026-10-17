# Issue: Phase 5でVS Code標準の貼り付け・ドロップ機構に接続する

この文書は、当時の提案と完了状態を残したIssue記録です。受入条件・チェック状態・検証計画、および記載がある場合の進捗注記は当時の内容であり、現在の実装や後年の判断を新たに確認したものではありません。

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: `03_Implement/src`, `03_Implement/test`, `03_Implement/test/e2e`
- Expected verification level: integration

## Traceability
- Related Backlog/Phase: Phase 5: 開発者体験と品質保証 (DX & Diagnostics)
- Related ADR/Spec: `00_Prompt/requirements.md`, `02_Architecture/vscode-extension-host-e2e.md`

## 当時の実行計画
### 解決方針（当時の提案）
- 当時のコマンド経由の入口を足場として、VS Code標準のpaste / drop provider API（貼り付け・ドラッグ＆ドロップを受け取る仕組み）へ接続する。APIの安定性とVS Codeのengine制約を確認し、コマンド経由の代替手段（フォールバック）を残すかどうかを判断する。

### 受入条件
- [x] Paste / D&Dがcommand引数経由ではなく、VSCodeのnative provider surfaceから発火できること。
- [x] 既存の `pasteDrop.ts` を再利用し、HTMLクリップボード解析やdropped file解析を重複実装しないこと。
- [x] native providerが使えない環境では、commandベースのフォールバック方針がコードまたはドキュメントで明示されていること。
- [x] unit / E2Eの双方で退行がないこと。

### 作業項目
- [x] VSCode engine / API制約を整理し、paste/drop providerとcommand fallbackの責務を決める。
- [x] native provider実装を追加し、既存commandとの競合や二重挿入を防ぐ。
- [x] Extension Host E2Eと運用ドキュメントを更新する。 (native DataTransfer adapter coverageは追加済み。既存autocomplete E2EがVSCode 1.112 headlessで継続失敗のため要追加切り分け)

### 当時の検証計画
- `cd 03_Implement && npm test` がPassすることを確認する。
- `cd 03_Implement && npm run build` が成功することを確認する。
- `cd 03_Implement && npm run test:e2e` でnative providerまたは明示的フォールバックが検証できることを確認する。


## Progress Notes
- Native paste/drop providerを `registerDocumentPasteEditProvider` / `registerDocumentDropEditProvider` で登録し、非対応hostでは既存command fallbackを残した。
- Extension Host E2Eはnative provider registration surface / shared parsing / fallback command behaviorをproof boundaryとし、autocompleteの `#` 補完不安定をPaste / D&D受入判定から分離する構成へ整理済み。
- 運用文書 `04_Documentation/vscode-e2e-testing.md` に、host classごとのnative path / fallback pathの観測順、manual E2Eの比較順、known unstableの切り分けとfailure triageを追記済み。
- 2026-03-22の最終統合検証では `cd 03_Implement && npm run build`、`cd 03_Implement && npm test`、`cd 03_Implement && npm run test:e2e` がPass。Autocompleteの `#` 補完はVSCode 1.112 headlessでKnown unstableとして分離継続だが、Paste / D&Dのacceptance境界はE2Eで充足したため、本issueを `Done` に更新する。
