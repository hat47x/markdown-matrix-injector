# Issue: プレビュー用CSSスタイルと表示・印刷への適用

この文書は、Phase 11のプレビュー用スタイルに関する当時の実装方針と受入記録です。`Status: Done`である一方、実プレビュー・PDF出力のmanual-e2e受入条件は未チェックです。作業項目側には実証済みとの記述もありますが、いずれも原記録のまま保持し、現行動作の新たな確認とは扱いません。

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: 03_Implement/media (新規CSS), package.json (contributes.markdown.previewStyles)
- Expected verification level: unit (クラス出力) + manual-e2e (実プレビュー見た目)

## Traceability
- Related Backlog/Phase: requirements.md Phase 11 (公開に足る品質ゲートG1/G2)
- Related ADR/Spec: ADR-0010 (Product Completion Gate) — 是正シーケンスstep 2
- Depends on: issue-0093 (preview結線・Done)

## 背景
issue-0093でプレビューへ注入結線したが、`markdown.previewStyles` のcontributionが無いため、レンダラが出力する
`mmi-table` / `mmi-card` / `mmi-embed` / `mmi-table__row--highlight` / `data-page-break` / `data-orientation` / `mmi-error`
等のクラス・属性に対するスタイルが実プレビューで適用されない。カードUI・ハイライト・印刷制御（@media print, @page）の
見た目が要件（requirements §Phase 2〜4）どおりにならない。

## 当時の実行計画
### 解決方針（当時の提案）
1. `03_Implement/media/markdown-matrix.css`（仮）を新設し、レンダラが出力するクラスや属性に対応したスタイルを定義する。
   - `@media screen`: テーブル可読性、カードUI、ハイライト行、エラー表示。
   - `@media print` / `@page`: `data-page-break` → `page-break-*`、`data-orientation` → 用紙向き、カード→別紙参照ブロック。
2. `package.json`の`contributes`に`"markdown.previewStyles": ["./media/markdown-matrix.css"]`を追加し、プレビューで使うスタイルを登録する。
3. レンダラが出力するCSSクラス/属性の一覧を、`src/core/render*.ts` から網羅的に確認し、未カバーが無いことを確認する。

### Acceptance criteria
- [x] レンダラが出力する全クラス/属性（table/card/embed/highlight/error/page-break/orientation）に対応するCSSが存在する。（`media/markdown-matrix.css`、coverageを `test/previewStyles.test.ts` で固定）
- [x] `package.json` が `markdown.previewStyles` をcontributeする。
- [x] `npm run build` / `npm test` がpass（152 unit pass、CSS追加による回帰なし）。
- [ ] (manual-e2e) 実プレビューでテーブル/カード/ハイライトが視認でき、PDF出力で改ページ・用紙向きが反映される。（issue-0098で実証）

### 作業項目（Task breakdown）
- [x] レンダラ出力クラス/属性の棚卸し（`test/previewStyles.test.ts` の `REQUIRED_SELECTORS` で固定）。
- [x] `media/markdown-matrix.css` 作成（screen + print、`previewStyles.test.ts` でカバレッジ検証）。
- [x] `package.json` にpreviewStyles追加（`previewStyles.test.ts` で検証）。
- [x] build / test検証、manual-e2eチェックリストへ追記（G1/G2 manual-e2eで実証済み）。

### 当時の検証計画（Validation plan）
- `npm run build` / `npm test` がexit 0。
- 出力クラス棚卸しとCSSセレクタの対応表をレビュー。
- 実プレビュー/PDFの見た目はmanual-e2e（delegated scope）で確認。
