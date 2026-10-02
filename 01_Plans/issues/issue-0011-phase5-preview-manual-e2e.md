# Issue: Phase 5 Markdown Preview / Problems manual E2E checklist

## Meta
- Type: Test
- Status: Done
- Priority: Medium
- Scope: `04_Documentation`, `03_Implement/test/e2e`
- Expected verification level: manual-e2e

## Traceability
- Related Backlog/Phase: Phase 5: 開発者体験と品質保証 (DX & Diagnostics)
- Related ADR/Spec: `00_Prompt/requirements.md`, `04_Documentation/vscode-e2e-testing.md`

## Execution Plan
### Proposed solution (解決策の概要)
- Extension Host APIレベルの自動化では拾い切れないPreview DOM表示、Problemsパネル視認、補完UXを、人手で再現できるチェックリストとして整備する。

### Acceptance criteria (受入条件)
- [x] Markdown Previewまたはエディタ上で、Autocomplete / Diagnostics / Paste / D&Dの手動確認手順が文書化されていること。
- [x] Problemsパネル・補完UI・挿入結果の期待値が具体的に書かれていること。
- [x] 自動E2Eの対象外とした理由（Preview DOM / native OS event）が明記されていること。

### Task breakdown (作業分解)
- [x] 自動E2Eで未カバーのUX項目を棚卸しする。
- [x] 手動チェックリストを作成し、期待結果と失敗時の見方を追記する。
- [x] 必要に応じて将来のPlaywright化候補を別節で整理する。

### Validation plan (検証計画)
- `04_Documentation/vscode-e2e-testing.md` の手順だけで次エージェントが再現できるかレビューする。
- 手動確認時の期待結果がAutocomplete / Diagnostics / Paste / D&Dの4系統をカバーしていることを確認する。
