# システム設計書 サンプル (MMI エンタープライズ出力デモ)

> **目的**: Markdown Matrix Injector の Phase 3〜4 出力品質（caption/相互参照/pageBreak/orientation/Smart Fallback）を  
> 代表的 SIer 設計書パターンで実証するサンプルです。  
> データ正本: `sier-design/` 配下の CSV ファイル（read-only 参照）。

---

## 目次

1. [要件トレーサビリティ](#tbl-req-trace)
2. [状態遷移表](#tbl-state-transition)
3. [障害切り分けガイド](#tbl-failure-triage)
4. [リリース判定表](#tbl-release-gate)

---

## 1. 要件トレーサビリティ

AUTH モジュール要件を抽出し、検証状況を確認します（`columns` + `grep` + `caption` + `id`）。

![[./req-trace.csv#Sheet1|A1:H9?header=first&columns=A,B,C,D,F,G&grep=AUTH&caption=表1: AUTH要件トレーサビリティ&id=tbl-req-trace]]

**全要件（印刷改ページ付き）** — 次ページに全件を横向きで掲載します。

![[./req-trace.csv#Sheet1|A1:H9?header=first&caption=表2: 全要件一覧（横向き）&id=tbl-req-trace-all&pageBreak=before&orientation=landscape]]

---

## 2. 状態遷移表

文書ライフサイクルの状態遷移を示します（`caption` + `id` + `pageBreak` + `orientation=landscape`）。

![[./state-transition.csv#Sheet1|A1:F6?header=first&caption=表3: 文書ライフサイクル状態遷移&id=tbl-state-transition&pageBreak=before&orientation=landscape]]

→ 状態遷移の詳細は [表3](#tbl-state-transition) を参照。  
→ 関連要件は [表1](#tbl-req-trace) の REQ-001〜003 を参照。

---

## 3. 障害切り分けガイド

PATH/SHEET 系の障害を抽出します（`highlight` + `grep` + `caption` + `id`）。

![[./failure-triage.csv#Sheet1|A1:F9?header=first&grep=PATH&highlightColumn=Severity&highlightValue=High&caption=表4: PATH系障害切り分け（Highのみハイライト）&id=tbl-failure-triage]]

**全障害パターン（別紙参照）** — 列数が多いため Smart Fallback でカード表示します。

![[./failure-triage.csv#Sheet1|A1:F9?mode=card&caption=別紙: 障害切り分けガイド全件&id=card-failure-triage-full]]

---

## 4. リリース判定表

品質ゲートの状態を確認します（`highlightColumn` + `pageBreak=before`）。

![[./release-gate.csv#Sheet1|A1:F6?header=first&highlightColumn=Status&highlightValue=pending&caption=表5: リリース判定表（要確認項目をハイライト）&id=tbl-release-gate&pageBreak=before]]

→ G1/G3/G4 は OK、G2 は手動確認が必要です（[G4 制約](#g4-honest-scope) 参照）。

---

## G4: 適用範囲と既知の制約 {#g4-honest-scope}

> **検証範囲の説明** — 表内の単体テスト件数や未実施項目は、サンプル作成時点の記録です。2026年6月3日のヘッドレスPDF検証と、未実施のVS Code画面確認は区別します。

### 動作確認済み（実証済み）

| 機能 | 確認方法 | 結果 |
|---|---|---|
| `![[...]]` のプレビュー描画 | unit test 154件（154 pass） | ✅ HTML 構造・クラス・属性すべて正常 |
| block-level 出力（`<p>` ラッパーなし） | unit test | ✅ 独立行埋め込みが `<p>` 内にネストしない |
| caption/id/figcaption | unit test | ✅ `<figcaption>` と `id` 属性が生成される |
| `pageBreak` → `data-page-break` | unit test | ✅ 属性が HTML に付与される |
| `orientation` → `data-orientation` | unit test | ✅ 属性が HTML に付与される |
| Smart Fallback カード UI | unit test | ✅ 列10超/セル500超/mode=card でカード化 |
| ハイライト行 | unit test | ✅ `mmi-table__row--highlight` クラス付与 |
| read-only（原本非改変） | 設計確認 | ✅ ビューア専用設計、write API を持たない |

### 実測が必要な確認事項（手動確認必要）

| 機能 | 必要環境 | 現状 |
|---|---|---|
| 実プレビューの視覚確認（スクリーンショット） | VS Code GUI | 未実施（WSL2 ヘッドレス環境） |
| `pageBreak` の PDF 改ページ再現 | PDF 生成器 | 下記「PDF 生成経路」参照 |
| `orientation=landscape` の用紙向き再現 | named-page 対応エンジン | 下記「PDF 生成経路」参照 |
| 別紙参照ブロックの印刷レイアウト | 印刷プレビュー | 未実施 |

### PDF 生成経路と確認範囲

経路Aは、このサンプルをVS CodeのMarkdown PDF拡張から直接出力する方法としては未検証です。経路Bのみ、MMIで展開したHTMLからWeasyPrintでPDFにする過去の検証記録があります。次の手順は、今回あらためて実行した結果ではありません。

**経路 A（未検証）: VS Code + Markdown PDF 拡張機能（yzane.markdown-pdf）**

- エンジン: Chromium/puppeteer（Chromium ヘッドレス印刷）
- `page-break-before/after`: ✅ 対応（`break-before: page` も有効）
- `@page named-page` per-page 用紙向き: ⚠️ Chromium の CSS Paged Media Level 3 実装依存（バージョンにより動作差あり）
- インストール: VS Code 拡張機能マーケットプレイスから `Markdown PDF` を検索

**経路 B（2026年6月3日にヘッドレス検証済み）: WeasyPrint（CLI）**

- `pip install weasyprint`
- `weasyprint 04_Documentation/samples/sier-design/design-doc-sample-rendered.html output.pdf`（リポジトリルートから実行）
- `page-break-before/after`: ✅ 対応
- `@page named-page` per-page 用紙向き: ✅ 対応（CSS Paged Media Level 3 実装）
- 注意: `03_Implement/scripts/render-sample-html.ts`でMMI参照を展開し、CSS入りHTMLを生成してからPDF化します。Pandoc単独では埋め込み参照を展開できません。実行手順は同じフォルダーのREADMEを参照してください。

**経路 C: Pandoc + LaTeX（pdflatex/xelatex）**

- `page-break`: ✅ 対応（Pandoc の `pagebreak` 拡張経由）
- `@page named-page` per-page 用紙向き: ❌ LaTeX は `@page` を解釈しない（LaTeX landscape 命令が必要）
- `data-page-break` / `data-orientation` 属性: ❌ LaTeX バックエンドには CSS 属性が届かない

**非対応・非推奨**

- wkhtmltopdf 0.12.x: `@page named-page` 未対応（per-page orientation は無効）
- Pandoc 単体（HTML出力なし直接 PDF）: LaTeX 経由のため上記経路 C と同様の制約

### G4 制約まとめ

- **改ページ（pageBreak）**: Chromium 系または weasyprint で再現可能。wkhtmltopdf/LaTeX では不安定。
- **per-page 横向き（orientation=landscape）**: weasyprint または Chromium 最新版（CSS Paged Media Level 3 実装済み）が必要。
- **カード→別紙参照（print 時 mmi-card__title::before）**: `content: "別紙参照: "` は CSS content プロパティ対応エンジンで有効（Chromium/weasyprint ✅）。
- **本プロダクトの役割範囲**: HTML と CSS の属性/クラス付与まで担保する。PDF レンダリングの最終品質は利用する PDF 生成器に依存し、本プロダクトの制御範囲外。

---

*このサンプルは `04_Documentation/samples/sier-design/` 配下で管理されます。*  
*関連 issue: [issue-0098](../../../01_Plans/issues/issue-0098-phase11-pdf-print-output-proof.md) / ADR-0010 G2/G4*
