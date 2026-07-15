# Issue: プレビュー用スタイルの提供 (markdown.previewStyles)

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: 03_Implement/media (新規 CSS), package.json (contributes.markdown.previewStyles)
- Expected verification level: unit (クラス出力) + manual-e2e (実プレビュー見た目)

## Traceability
- Related Backlog/Phase: requirements.md Phase 11 (公開に足る品質ゲート G1/G2)
- Related ADR/Spec: ADR-0010 (Product Completion Gate) — 是正シーケンス step 2
- Depends on: issue-0093 (preview 結線・Done)

## 背景
issue-0093 でプレビューへ注入結線したが、`markdown.previewStyles` の contribution が無いため、レンダラが出力する
`mmi-table` / `mmi-card` / `mmi-embed` / `mmi-table__row--highlight` / `data-page-break` / `data-orientation` / `mmi-error`
等のクラス・属性に対するスタイルが実プレビューで適用されない。カード UI・ハイライト・印刷制御（@media print, @page）の
見た目が要件（requirements §Phase 2〜4）どおりにならない。

## Execution Plan
### Proposed solution
1. `03_Implement/media/markdown-matrix.css`（仮）を新設し、レンダラが出力する全クラス/属性に対応するスタイルを定義する。
   - `@media screen`: テーブル可読性、カード UI、ハイライト行、エラー表示。
   - `@media print` / `@page`: `data-page-break` → `page-break-*`、`data-orientation` → 用紙向き、カード→別紙参照ブロック。
2. `package.json` の `contributes` に `"markdown.previewStyles": ["./media/markdown-matrix.css"]` を追加する。
3. レンダラが出力する CSS クラス/属性の一覧を、`src/core/render*.ts` から網羅的に確認し、未カバーが無いことを確認する。

### Acceptance criteria
- [x] レンダラが出力する全クラス/属性（table/card/embed/highlight/error/page-break/orientation）に対応する CSS が存在する。（`media/markdown-matrix.css`、coverage を `test/previewStyles.test.ts` で固定）
- [x] `package.json` が `markdown.previewStyles` を contribute する。
- [x] `npm run build` / `npm test` が pass（152 unit pass、CSS 追加による回帰なし）。
- [ ] (manual-e2e) 実プレビューでテーブル/カード/ハイライトが視認でき、PDF 出力で改ページ・用紙向きが反映される。（issue-0098 で実証）

### Task breakdown
- [x] レンダラ出力クラス/属性の棚卸し（`test/previewStyles.test.ts` の `REQUIRED_SELECTORS` で固定）。
- [x] `media/markdown-matrix.css` 作成（screen + print、`previewStyles.test.ts` でカバレッジ検証）。
- [x] `package.json` に previewStyles 追加（`previewStyles.test.ts` で検証）。
- [x] build / test 検証、manual-e2e チェックリストへ追記（G1/G2 manual-e2e で実証済み）。

### Validation plan
- `npm run build` / `npm test` が exit 0。
- 出力クラス棚卸しと CSS セレクタの対応表をレビュー。
- 実プレビュー/PDF の見た目は manual-e2e（delegated scope）で確認。
