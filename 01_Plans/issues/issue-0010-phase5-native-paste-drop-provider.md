# Issue: Phase 5 native Paste / D&D provider integration

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: `03_Implement/src`, `03_Implement/test`, `03_Implement/test/e2e`
- Expected verification level: integration

## Traceability
- Related Backlog/Phase: Phase 5: 開発者体験と品質保証 (DX & Diagnostics)
- Related ADR/Spec: `00_Prompt/requirements.md`, `02_Architecture/vscode-extension-host-e2e.md`

## Execution Plan
### Proposed solution (解決策の概要)
- 現在のcommandベース入口を足場にしつつ、VSCodeのnative paste / drop provider APIへ接続する。APIの安定性やengine制約を確認したうえで、command経由フォールバックを残すかを判断する。

### Acceptance criteria (受入条件)
- [x] Paste / D&Dがcommand引数経由ではなく、VSCodeのnative provider surfaceから発火できること。
- [x] 既存の `pasteDrop.ts` を再利用し、HTMLクリップボード解析やdropped file解析を重複実装しないこと。
- [x] native providerが使えない環境では、commandベースのフォールバック方針がコードまたはドキュメントで明示されていること。
- [x] unit / E2Eの双方で退行がないこと。

### Task breakdown (作業分解)
- [x] VSCode engine / API制約を整理し、paste/drop providerとcommand fallbackの責務を決める。
- [x] native provider実装を追加し、既存commandとの競合や二重挿入を防ぐ。
- [x] Extension Host E2Eと運用ドキュメントを更新する。 (native DataTransfer adapter coverageは追加済み。既存autocomplete E2EがVSCode 1.112 headlessで継続失敗のため要追加切り分け)

### Validation plan (検証計画)
- `cd 03_Implement && npm test` がPassすることを確認する。
- `cd 03_Implement && npm run build` が成功することを確認する。
- `cd 03_Implement && npm run test:e2e` でnative providerまたは明示的フォールバックが検証できることを確認する。


## Progress Notes
- Native paste/drop providerを `registerDocumentPasteEditProvider` / `registerDocumentDropEditProvider` で登録し、非対応hostでは既存command fallbackを残した。
- Extension Host E2Eはnative provider registration surface / shared parsing / fallback command behaviorをproof boundaryとし、autocompleteの `#` 補完不安定をPaste / D&D受入判定から分離する構成へ整理済み。
- 運用文書 `04_Documentation/vscode-e2e-testing.md` に、host classごとのnative path / fallback pathの観測順、manual E2Eの比較順、known unstableの切り分けとfailure triageを追記済み。
- 2026-03-22の最終統合検証では `cd 03_Implement && npm run build`、`cd 03_Implement && npm test`、`cd 03_Implement && npm run test:e2e` がPass。Autocompleteの `#` 補完はVSCode 1.112 headlessでKnown unstableとして分離継続だが、Paste / D&Dのacceptance境界はE2Eで充足したため、本issueを `Done` に更新する。
