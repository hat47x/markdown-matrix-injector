# Issue: カードの「開くボタン」(env.openExternal) 未実装 (Phase 4 完成度ギャップ)

## Meta
- Type: Feature
- Status: Open
- Priority: Medium
- Scope: 03_Implement/src/core/renderCard.ts, 03_Implement/src/extension.ts (webview link handling), 03_Implement/media/markdown-matrix.css
- Expected verification level: unit (HTML 構造) + manual-e2e (実 webview クリック挙動)

## Traceability
- Related Backlog/Phase: requirements.md Phase 4「画面UI: 『ファイル名・範囲・開くボタン』を持つリッチなリンクカードUI（クリックで env.openExternal）」
- Related ADR/Spec: ADR-0011 (Card Open Affordance — 実現方式決定済み) / ADR-0010 (Product Completion Gate)
- 同種ギャップ: issue-0093 / issue-0099

## 背景
要件 Phase 4 はカード UI に「開くボタン（クリックで `env.openExternal`）」を求めるが、現在の `renderCard.ts` は
`mmi-card__title` と `mmi-card__meta` のみで、**開くボタンも `openExternal` 連携も未実装**（`openExternal` は src 全体で 0 件）。
別紙カードから元ファイル（Excel 等）をワンクリックで開けない。

## 留意点（未着手の理由）
- VS Code Markdown プレビューは sandboxed webview であり、`command:` URI 有効化や CSP の制約がある。`env.openExternal` 相当の
  挙動（OS 既定アプリで開く）を webview のリンク/ボタンから安全に発火させる方式の検討が必要。
- クリック挙動の正しさは実 webview でしか検証できない（GUI 必須）。「動くことを実証してからリリース」の原則（ADR-0010）に従い、
  ヘッドレス環境での盲目的実装は避け、本 issue として明示的にトラッキングする。

## Execution Plan（提案・未実施）
### Proposed solution
1. `renderCard.ts` に「開く」リンク/ボタン要素を追加（`mmi-card__open` 等）。リンク先は元ファイルの解決パス。
2. webview からのファイルオープン方式を決定（`command:` URI + `enableCommandUris`、または VS Code が解決する相対リンク）。
   方式は ADR で決定（不可逆な設計判断のため）。
3. `media/markdown-matrix.css` に開くボタンのスタイルを追加。
4. unit で HTML 構造（リンク存在・解決パス）を固定し、manual-e2e（Checklist）で実クリック挙動を確認。

### Acceptance criteria
- [ ] カード UI にファイル名・範囲に加え「開く」操作要素が存在する（unit で HTML 構造を固定）。
- [ ] 実 VS Code プレビューでクリックすると元ファイルが開く（manual-e2e、GUI 必須）。
- [ ] webview セキュリティ（CSP / command URI）方針が ADR に記録される。
- [ ] `npm run build` / `npm test` pass。
