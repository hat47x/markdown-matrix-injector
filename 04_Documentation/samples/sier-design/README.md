# SIer Design Document Sample — G2/G4 Evidence Pack

> この資料は過去の検証記録です。最新の導入手順は [実務サンプル](../practical/README.md)、実機・PDFの確認範囲は [2026-09-08以降の検証記録](../../release-validation-2026-09-08.md) を参照してください。下記の経路Aは未検証であり、推奨経路とは扱いません。

`design-doc-sample.md`のG4節には、作成時点の「推奨経路A」という説明も残っています。**実際に確認したPDF生成経路は本READMEの経路B**です。サンプル本文にある古い記述だけを根拠に、VS CodeのMarkdown PDF拡張からの直接出力を検証済みと判断しないでください。

**目的**: 代表的なSIerの設計書を題材に、ADR-0010が定める公開品質の判定条件であるG2（企業向け出力の実証）とG4（適用範囲の正確な説明）を実証するためのサンプルです。

## ファイル構成

| ファイル | 説明 |
|---|---|
| `design-doc-sample.md` | Markdown形式の設計書サンプル（Phase 3～4の全機能を使用） |
| `req-trace.csv` | 要件の追跡表（正本データ） |
| `state-transition.csv` | 状態遷移表（正本データ） |
| `failure-triage.csv` | 障害切り分けガイド（正本データ） |
| `release-gate.csv` | リリース判定表（正本データ） |
| `design-doc-sample-rendered.html` | **MMIの処理系**で生成したHTML（埋め込み参照を展開済み、CSSを埋め込み済み。G2の中間的な検証根拠）。`03_Implement/scripts/render-sample-html.ts` で再生成可能 |
| `design-doc-sample.pdf` | 実際に生成したPDF（WeasyPrint、7ページ。改ページ、横向き、別紙への参照を再現。**G2の正式な検証根拠**） |
| `design-doc-sample.delivery-manifest.csv` | `MMI: Generate Delivery Manifest` コマンドの出力例（別紙を指すカード1件を抽出。Phase 4の要求に対応） |

## G2: 実証した機能と確認方法

| 機能 | 確認方法 | 結果 |
|---|---|---|
| caption / figcaption | unit test (`enterpriseOutput.test.ts`) | ✅ 167 pass |
| id（相互参照アンカー） | unit test | ✅ |
| `pageBreak=before/after/both` → `data-page-break` | unit test | ✅ |
| `orientation=landscape` → `data-orientation` | unit test | ✅ |
| pageBreak + orientation の組み合わせ | unit test | ✅ |
| Smart Fallback カード（`mmi-card` + `data-path`） | unit test | ✅ 別紙参照に必要な属性を確認 |
| ハイライト行（`mmi-table__row--highlight`） | unit test | ✅ |
| `@media print` CSS が HTML に埋め込まれる | Pandoc HTML 出力検証 | ✅ `@media print` / `page-break-before` ×4 / `@page` ×6 を確認 |
| G3: 原本 CSV が改変されない | unit test（read-only 保証） | ✅ |

## G2: 実 PDF 生成（手動確認ステップ）

以下ではPDFを生成する経路を分けて説明します。経路Aの画面操作はWSL2のヘッドレス環境では実行できません。一方、経路Bは**2026年6月3日のヘッドレス検証**で実証済みです。既存のWordやExcel・CSVを廃止する必要はなく、MMIは参照元の表を読み取り専用で扱います。

### 経路 A（未検証）: VS Code + Markdown PDF 拡張機能

1. VS Codeで`design-doc-sample.md`を開く
2. MMI拡張機能が有効で、`![[...]]`がプレビューで展開されることを確認する
3. コマンドパレットから`Markdown PDF: Export (pdf)`を選ぶ
4. 出力されたPDFで次の点を確認する。
   - 「表2: 全要件一覧（横向き）」の前で改ページが入る
   - 「表3: 文書ライフサイクル状態遷移」が横向きページで出力される
   - カード（`別紙: 障害切り分けガイド全件`）が「別紙参照:」プレフィックス付きのブロックで表示される

### 経路 B（CI/ヘッドレス、実証済み）: MMI レンダリング HTML + weasyprint

> **重要**: PDFへ変換するHTMLには、**MMIの処理系で`![[...]]`を展開したもの**を使うこと。
> Pandocだけで生成したHTMLでは埋め込み参照が未展開のまま残り、表・横向き表示・カードのいずれも表示されません。

リポジトリの**ルートディレクトリから**以下を実行する例です。先に`03_Implement`の依存関係が導入されている必要があります。`( ... )`内の移動はサブシェルに限定され、後続の`weasyprint`はリポジトリルート基準のパスで実行されます。

```bash
# 1) 本サンプル同梱の rendered.html は MMI で展開済み（render-sample-html.ts 生成）。
#    自分で再生成する場合:
(cd 03_Implement && node --import tsx scripts/render-sample-html.ts)

# 2) weasyprint で PDF 化
weasyprint 04_Documentation/samples/sier-design/design-doc-sample-rendered.html output.pdf
```

この経路は2026年6月3日に検証済みです（`design-doc-sample.pdf`、7ページ）。検証ログ: `04_Documentation/samples/manual-e2e-g1-g2-result-2026-06-03.md`。

検証ログには、**当時の**`design-doc-sample-rendered.html`がPandoc単独で生成され、MMIの表に展開されていなかったという問題も記録されています。一方、**現在Git管理されている**同名のHTMLにはMMIで展開された表・カードの要素が含まれます（ファイル内容の静的確認）。この時点差を、新たにPDFを再生成・実機確認した証拠と混同しないでください。

### 経路 C: MMI レンダリング HTML → Chromium headless print

次は選択可能な変換方法を示す例です。このコマンドによる**今回の実行結果や印刷品質の合格記録ではありません**。最終レイアウトは利用するChromiumのバージョンやCSS対応範囲によります。

```bash
# Chromium/Chrome が必要。HTML は経路 B 同様 MMI 展開済みのものを使う
chromium-browser --headless --print-to-pdf=output.pdf 04_Documentation/samples/sier-design/design-doc-sample-rendered.html
```

## G4: 正直な適用範囲（実測ベース）

### 確認済み（自動テストで担保）

- `![[...]]` → HTML 構造（クラス/属性）の正しさ: **単体テスト167件で検証**
- `data-page-break` / `data-orientation` 属性の付与: **unit で実証**
- `@media print` + `page-break-before/after` + `@page landscape/portrait` の CSS 定義: **CSSの対象範囲を確認する単体テストで検証**
- 原本データの非改変（read-only）: **unit で実証**

### 視覚確認（2026-06-03 CI/ヘッドレス経路で実施済み）

検証ログ: `04_Documentation/samples/manual-e2e-g1-g2-result-2026-06-03.md`

- 確認済み：プレビューの描画（G1のチェックリストFの観測点6件すべてが合格）： `screenshots/phase11-g1-preview.png`
- 確認済み：PDFの改ページ再現（表2の前で改ページ）： `screenshots/phase11-g2-page5-highlight-pagebreak.png`
- 確認済み：PDFでのページごとの横向き再現（2・3ページが横向き、名前付き`@page`が動作）： `screenshots/phase11-g2-page2-landscape.png` / `…page3-landscape-card.png`
- 確認済み：カードに付ける「別紙参照:」という表示： 同上 page3 PNG

### GUI 担当者向けに残る確認（必要時のみ）

- VS Codeのプレビュー画面（WebView）の**実際の画面記録**。これまでの確認では本番用の処理系と寄稿されたCSSで同等の描画を検証しましたが、WebView自体の画面取得にはGUIが必要です。
- VS Codeの`Markdown PDF`拡張機能（経路A）でのPDF出力

### PDF 生成器の既知制約（実測）

| エンジン | pageBreak 対応 | per-page orientation 対応 | 備考 |
|---|---|---|---|
| VS Code Markdown PDF (Chromium) | 未検証 | 未検証 | MMI記法が展開されるかを含めて検証が必要 |
| weasyprint | ✅ | ✅ | `pip install weasyprint` |
| Chromium headless | ✅ | ⚠️ CSS Paged Media L3 実装依存 | バージョン確認要 |
| wkhtmltopdf 0.12.x | ✅ | ❌ `@page named-page` 未対応 | per-page 向きは無効 |
| Pandoc + LaTeX | ⚠️ LaTeX 命令が必要 | ❌ CSS `@page` を解釈しない | MMI との相性が低い |

### 本プロダクトの責任範囲

MMI は HTML と CSS の属性/クラス付与（`data-page-break`/`data-orientation`/`mmi-*`）まで担保します。  
PDFの最終的な表示品質は使用するPDF生成器に依存し、MMIでは制御できません。

---

**関連**: [issue-0098](../../../01_Plans/issues/issue-0098-phase11-pdf-print-output-proof.md) / [ADR-0010](../../../01_Plans/adr/ADR-0010-product-completion-gate.md)
