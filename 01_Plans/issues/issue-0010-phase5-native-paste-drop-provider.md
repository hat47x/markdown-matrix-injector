# Issue: Phase 5 native Paste / D&D provider integration

## Meta
- Type: Feature
- Status: Open
- Priority: High
- Scope: `03_Implement/src`, `03_Implement/test`, `03_Implement/test/e2e`
- Expected verification level: integration

## Traceability
- Related Backlog/Phase: Phase 5: 開発者体験と品質保証 (DX & Diagnostics)
- Related ADR/Spec: `00_Prompt/requirements.md`, `02_Architecture/vscode-extension-host-e2e.md`

## Execution Plan
### Proposed solution (解決策の概要)
- 現在の command ベース入口を足場にしつつ、VSCode の native paste / drop provider API へ接続する。API の安定性や engine 制約を確認したうえで、command 経由フォールバックを残すかを判断する。

### Acceptance criteria (受入条件)
- [ ] Paste / D&D が command 引数経由ではなく、VSCode の native provider surface から発火できること。
- [ ] 既存の `pasteDrop.ts` を再利用し、HTML クリップボード解析や dropped file 解析を重複実装しないこと。
- [ ] native provider が使えない環境では、command ベースのフォールバック方針がコードまたはドキュメントで明示されていること。
- [ ] unit / E2E の双方で退行がないこと。

### Task breakdown (作業分解)
- [ ] VSCode engine / API 制約を整理し、paste/drop provider と command fallback の責務を決める。
- [ ] native provider 実装を追加し、既存 command との競合や二重挿入を防ぐ。
- [ ] Extension Host E2E と運用ドキュメントを更新する。

### Validation plan (検証計画)
- `cd 03_Implement && npm test` が Pass することを確認する。
- `cd 03_Implement && npm run build` が成功することを確認する。
- `cd 03_Implement && npm run test:e2e` で native provider または明示的フォールバックが検証できることを確認する。
