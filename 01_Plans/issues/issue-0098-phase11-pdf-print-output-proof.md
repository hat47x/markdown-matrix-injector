# Issue: エンタープライズ出力（PDF/印刷）の実証 (G2) と適用範囲の明文化 (G4)

## Meta
- Type: Test
- Status: In Progress
- Priority: High
- Scope: 04_Documentation/samples (代表 SIer サンプル + PDF 手順), 03_Implement/media (print CSS), test/fixtures
- Expected verification level: manual-e2e

## Traceability
- Related Backlog/Phase: requirements.md Phase 11 (公開に足る品質ゲート G2 / G4)
- Related ADR/Spec: ADR-0010 (Product Completion Gate) — 是正シーケンス step 5〜6
- Depends on: issue-0094 (preview styles の print 規則), issue-0097 (実描画の実証)

## 背景
本質価値の 3「Word 代替に足るエンタープライズ出力」は、caption/相互参照/pageBreak/orientation/Smart Fallback が **PDF 出力まで含めて**
意図どおり再現されて初めて達成といえる。現状これは実測の裏付けがない（print CSS 未提供、対応 PDF 生成器の明示なし、実 PDF の検証なし）。
G2 を代表サンプルで実証し、動かない条件を G4 として正直に文書化する。

## Execution Plan
### Proposed solution
1. 代表的な SIer 設計書サンプル（要件トレーサビリティ/状態遷移/障害切り分け等、Phase 9 ベンチマーク資産を活用）に、
   caption・相互参照（`id` アンカー）・`pageBreak`・`orientation`・Smart Fallback（巨大表の別紙参照ブロック）を含む Markdown を用意する。
2. 少なくとも 1 つの具体的な PDF 生成経路（例: Markdown PDF 系 / Pandoc 等）を選定し、print CSS（`@media print` / `@page`）と連携して
   実際に PDF を出力する。改ページ・用紙向き・カードの別紙化・キャプション/相互参照が再現されることを確認する。
3. 再現結果（実 PDF・スクリーンショット）をエビデンス化し、対応した生成器・バージョン・前提を明示する。
4. 再現しない条件（別 PDF 生成器、特定 CSS 非対応、巨大ファイル限界、XML 種別）を **実測ベースで** G4 として文書化する。

### Acceptance criteria
- [x] 代表 SIer サンプルで caption/相互参照/pageBreak/orientation/Smart Fallback が HTML 構造として正しく生成される（unit test `enterpriseOutput.test.ts` 13件、167 pass）。
- [x] `@media print` / `page-break-before/after` / `@page landscape/portrait` CSS が `media/markdown-matrix.css` に定義済み（CSS coverage unit で確認）。
- [x] Pandoc で自己完結 HTML（`design-doc-sample-rendered.html`）を生成済み — `@media print` / `page-break-before` ×4 / `@page` ×6 の埋め込みを確認（G2 中間エビデンス）。
- [x] 対応 PDF 生成器（weasyprint / VS Code Markdown PDF / Chromium headless）と per-page orientation の制約を実測ベースで文書化（G4: `04_Documentation/samples/sier-design/README.md`）。
- [x] 原本 CSV の非改変（G3）を unit test で実証。
- [ ] 実 PDF の目視確認（GUI/CI 環境で実施 — 下記 G4 制約参照）。

### Task breakdown
- [x] 4 種 CSV fixture（req-trace/state-transition/failure-triage/release-gate）作成（samples + test fixtures）。
- [x] `design-doc-sample.md`：全 Phase 3-4 機能を使った代表 SIer 設計書サンプル。
- [x] print CSS（issue-0094 で整備済みの `media/markdown-matrix.css`）との連携確認。
- [x] Pandoc HTML 生成（CSS 埋め込み済み `design-doc-sample-rendered.html`）。
- [x] unit test `enterpriseOutput.test.ts`（G2/G3/G4 を担保する 13 テスト）。
- [x] G4 文書（`04_Documentation/samples/sier-design/README.md`）— PDF 生成器別の対応/非対応を実測ベースで記載。
- [ ] 実 PDF 目視確認（VS Code GUI or CI 環境）。

### Validation plan（実績）
- unit test 167 pass（enterpriseOutput.test.ts 13件 含む）。
- Pandoc HTML に `@media print` / `page-break-before` / `@page` が埋め込まれることを shell で確認済み。
- G4 制約（wkhtmltopdf 非対応 / Pandoc LaTeX 非対応 / weasyprint 推奨）を文書化済み。
- 実 PDF の最終目視確認は GUI/CI 環境で実施（WSL2 ヘッドレスでは xvfb + Chromium が必要）。
