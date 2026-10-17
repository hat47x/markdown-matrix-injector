# Issue: Phase 5のプレビュー・Problemsなどの手動E2E確認手順を整える

この文書は、当時の提案と完了状態を残したIssue記録です。受入条件・チェック状態・検証計画、および記載がある場合の進捗注記は当時の内容であり、現在の実装や後年の判断を新たに確認したものではありません。

## Meta
- Type: Test
- Status: Done
- Priority: Medium
- Scope: `04_Documentation`, `03_Implement/test/e2e`
- Expected verification level: manual-e2e

## Traceability
- Related Backlog/Phase: Phase 5: 開発者体験と品質保証 (DX & Diagnostics)
- Related ADR/Spec: `00_Prompt/requirements.md`, `04_Documentation/vscode-e2e-testing.md`

## 当時の実行計画
### 解決方針（当時の提案）
- Extension Host APIを使う自動テストだけでは確認し切れない、Markdownプレビューの表示（Preview DOM）、Problemsパネルの見え方、入力補完の操作感（補完UX）について、人が手順に沿って確認できるチェックリストを整備する。

### 受入条件
- [x] Markdown Previewまたはエディタ上で、Autocomplete / Diagnostics / Paste / D&Dの手動確認手順が文書化されていること。
- [x] Problemsパネル・補完UI・挿入結果の期待値が具体的に書かれていること。
- [x] 自動E2Eの対象外とした理由（Preview DOM / native OS event）が明記されていること。

### 作業項目
- [x] 自動E2Eで未カバーのUX項目を棚卸しする。
- [x] 手動チェックリストを作成し、期待結果と失敗時の見方を追記する。
- [x] 必要に応じて将来のPlaywright化候補を別節で整理する。

### 当時の検証計画
- `04_Documentation/vscode-e2e-testing.md` の手順だけで次エージェントが再現できるかレビューする。
- 手動確認時の期待結果がAutocomplete / Diagnostics / Paste / D&Dの4系統をカバーしていることを確認する。
