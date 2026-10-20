# Issue: PDF・印刷出力の実証（G2）と適用範囲の明確化（G4）

この文書は当時のIssue記録です。原記録では2026年6月3日のWeasyPrintによるPDF確認が記載されていますが、実PDF目視確認の作業項目は未チェックです。双方を保持し、現在のGUI・PDF出力の新たな確認とは扱いません。

## Meta
- Type: Test
- Status: Done
- Priority: High
- Scope: 04_Documentation/samples (代表SIerサンプル + PDF手順), 03_Implement/media (print CSS), test/fixtures
- Expected verification level: manual-e2e

## Traceability
- Related Backlog/Phase: requirements.md Phase 11 (公開に足る品質ゲートG2 / G4)
- Related ADR/Spec: ADR-0010 (Product Completion Gate) — 是正シーケンスstep 5〜6
- Depends on: issue-0094 (preview stylesのprint規則), issue-0097 (実描画の実証)

## 背景
本質価値の3「Word代替に足るエンタープライズ出力」は、caption/相互参照/pageBreak/orientation/Smart Fallbackが **PDF出力まで含めて**
意図どおり再現されて初めて達成といえる。現状これは実測の裏付けがない（print CSS未提供、対応PDF生成器の明示なし、実PDFの検証なし）。
G2を代表サンプルで実証し、動かない条件をG4として正直に文書化する。

## 当時の実行計画
### 解決方針（当時の提案）
1. 代表的なSIer設計書サンプル（要件トレーサビリティ/状態遷移/障害切り分け等、Phase 9ベンチマーク資産を活用）に、
   caption・相互参照（`id` アンカー）・`pageBreak`・`orientation`・Smart Fallback（巨大表の別紙参照ブロック）を含むMarkdownを用意する。
2. 少なくとも1つの具体的なPDF生成経路（例: Markdown PDF系 / Pandoc等）を選定し、print CSS（`@media print` / `@page`）と連携して
   実際にPDFを出力する。改ページ・用紙向き・カードの別紙化・キャプション/相互参照が再現されることを確認する。
3. 再現結果（実PDF・スクリーンショット）をエビデンス化し、対応した生成器・バージョン・前提を明示する。
4. 再現しない条件（別PDF生成器、特定CSS非対応、巨大ファイル限界、XML種別）を **実測ベースで** G4として文書化する。

### 受入条件（Acceptance criteria）
- [x] 代表SIerサンプルでcaption/相互参照/pageBreak/orientation/Smart FallbackがHTML構造として正しく生成される（unit test `enterpriseOutput.test.ts` 13件、167 pass）。
- [x] `@media print` / `page-break-before/after` / `@page landscape/portrait` CSSが `media/markdown-matrix.css` に定義済み（CSS coverage unitで確認）。
- [x] Pandocで自己完結HTML（`design-doc-sample-rendered.html`）を生成済み — `@media print` / `page-break-before` ×4 / `@page` ×6の埋め込みを確認（G2中間エビデンス）。
- [x] 対応PDF生成器（weasyprint / VS Code Markdown PDF / Chromium headless）とper-page orientationの制約を実測ベースで文書化（G4: `04_Documentation/samples/sier-design/README.md`）。
- [x] 原本CSVの非改変（G3）をunit testで実証。
- [x] 実PDFの目視確認（2026-06-03、CI/ヘッドレス経路WeasyPrintで実施）: 7ページPDF（`design-doc-sample.pdf`）で改ページ・p2/p3横向き（named `@page`）・別紙参照カードを確認。証跡PNG: `screenshots/phase11-g2-page{2,3,5}-*.png`、ログ: `manual-e2e-g1-g2-result-2026-06-03.md`。

### 作業項目（Task breakdown）
- [x] 4種CSV fixture（req-trace/state-transition/failure-triage/release-gate）作成（samples + test fixtures）。
- [x] `design-doc-sample.md`：全Phase 3-4機能を使った代表SIer設計書サンプル。
- [x] print CSS（issue-0094で整備済みの `media/markdown-matrix.css`）との連携確認。
- [x] Pandoc HTML生成（CSS埋め込み済み `design-doc-sample-rendered.html`）。
- [x] unit test `enterpriseOutput.test.ts`（G2/G3/G4を担保する13テスト）。
- [x] G4文書（`04_Documentation/samples/sier-design/README.md`）— PDF生成器別の対応/非対応を実測ベースで記載。
- [ ] 実PDF目視確認（VS Code GUI or CI環境）。

### 当時の検証計画（Validation plan）（実績）
- unit test 167 pass（enterpriseOutput.test.ts 13件 含む）。
- Pandoc HTMLに `@media print` / `page-break-before` / `@page` が埋め込まれることをshellで確認済み。
- G4制約（wkhtmltopdf非対応 / Pandoc LaTeX非対応 / weasyprint推奨）を文書化済み。
- 実PDFの最終目視確認はGUI/CI環境で実施（WSL2ヘッドレスではxvfb + Chromiumが必要）。
