# Manual E2E Result — G1 (Checklist F) / G2 (sier-design README)

- Date: 2026-06-03

> この文書は当時のヘッドレス環境での検証記録です。G1/G2のPASSはCI経路での結果であり、VS Codeの実画面を操作・撮影したことを意味しません。
- Operator: automated headless run (Cowork)
- Source procedures: `04_Documentation/vscode-e2e-testing.md` → **Checklist F (G1)**, `04_Documentation/samples/sier-design/README.md` → **G2: 実 PDF 生成**

## Environment / classification

| Item | Value |
|---|---|
| Host class | **Headless CI** (no interactive VS Code GUI; `DISPLAY` empty, `code` not installed) |
| Render engine | WeasyPrint 69.0 (README G2 **Route B** = CI/headless route) |
| Preview pipeline | Production `markdownMatrixPlugin` (the exact path `extendMarkdownIt` / `renderEmbedForTest` use), driven from Node against the built `dist/` + contributed `media/markdown-matrix.css` |
| Fonts | Droid Sans Fallback (CJK ✓). No color-emoji font → `✅`/`❌` in G4 tables render as `.notdef` boxes (cosmetic only) |
| Rasterization | WeasyPrint → PDF → `pdftoppm` PNG |

> **Scope honesty (G4):** This is the **CI route** that the task explicitly allows ("実機 VS Code または CI"). It exercises the same render pipeline + the same contributed preview CSS, so the HTML/structure/print-CSS behaviour is faithful. What it does **not** reproduce is a literal capture of the VS Code preview *webview* (Route A, `Markdown PDF` extension) — that still needs a human on a GUI machine. HTML structure/classes/attributes are already proven by automation (167 unit + e2e `markdown-preview-entry`); these screenshots add the *visual* confirmation on top.

## G1 — Checklist F (Markdown Preview rendering)

Fixture created per Checklist F step 2: `03_Implement/test/fixtures/workspace/docs/phase11-preview-g1.md`.
Screenshot: `04_Documentation/samples/screenshots/phase11-g1-preview.png`

| Observation point | Expected | Result |
|---|---|---|
| テーブルが描画される | 2-column `<table>`, not raw `![[...]]` | ✅ Pass |
| caption が表示される | 「ロール一覧」above table | ✅ Pass (`mmi-embed__caption`) |
| ハイライト行がある | Admin row stands out | ✅ Pass (`mmi-table__row--highlight`, yellow) |
| カードが描画される | wide.csv → link card (auto degrade) | ✅ Pass (`mmi-card`: title `wide.csv`, meta `Sheet1 / A1:K2`) |
| 段落内に block 混入なし | figures not nested in `<p>` | ✅ Pass (block-level `<figure>`) |
| スタイルが適用されている | borders + highlight visible | ✅ Pass |

`data-page-break="before"` / `data-orientation="landscape"` are present in the emitted HTML for the 3rd embed; they are `@media print`-only, so (correctly) have no visual effect in the screen preview — their visual proof is G2 below.

## G2 — sier-design README (real PDF)

Rendered the source `design-doc-sample.md` through the MMI pipeline (README Route B primary instruction: "MMI プレビューで HTML をコピー"), then WeasyPrint → PDF.
PDF: `04_Documentation/samples/sier-design/design-doc-sample.pdf` (7 pages)
Evidence PNGs: `screenshots/phase11-g2-page2-landscape.png`, `…page3-landscape-card.png`, `…page5-highlight-pagebreak.png`

| README check | Result |
|---|---|
| 「表2: 全要件一覧（横向き）」の前で改ページ | ✅ Pass — 表2 starts a new page (p1→p2) |
| 「表3: 文書ライフサイクル状態遷移」が横向きページ | ✅ Pass — p3 LANDSCAPE (also 表2 on p2 LANDSCAPE) |
| カード（別紙: 障害切り分けガイド全件）が「別紙参照:」プレフィックス付き | ✅ Pass — renders `別紙参照: failure-triage.csv` + path |

Per-page orientation (proves named `@page`): p1 portrait, **p2 LANDSCAPE**, **p3 LANDSCAPE**, p4–p7 portrait.
Bonus features also visually confirmed: `columns`+`grep` filter (表1), `highlight` rows (表4 High, 表5 pending), `caption`/`id`, and `pageBreak=before` on 表5.

## Findings

以下は当時の検証で確認した制約と改善候補です。改善の実装や再検証の完了を示すものではありません。

1. **`design-doc-sample-rendered.html` is not a valid G2 source.** It was produced by Pandoc alone, which cannot expand MMI embeds — the `![[...]]` survive as literal `[[...]]` text inside `<p>`, so it contains **zero** `mmi-embed` figures. A PDF made from it (README Route B as literally written, using that file) shows no tables/landscape/cards. The working path is to render the `.md` through the MMI pipeline first (done here). Recommend regenerating that HTML from the real preview output, or annotating the README.
2. **Card straddles the landscape→portrait page boundary** (p3→p4): the `data-path` `::after` block of the 別紙参照 card spilled to p4. Cosmetic; consider `break-inside: avoid` on `.mmi-card` in the print stylesheet.
3. **No emoji font** in the headless host → `✅`/`❌` in the G4 tables render as boxes. Affects only the explanatory G4 tables, not the G1/G2 proof.

## Verdict

G1 (Checklist F) and G2 (sier-design README) **PASS** via the CI/headless route. Remaining for a GUI operator: literal VS Code preview-webview capture and the `Markdown PDF` extension path (Route A), if that specific evidence is required.
