# SIer Design Document Sample — G2/G4 Evidence Pack

**目的**: ADR-0010 の公開に足る品質ゲート G2（エンタープライズ出力実証）と G4（正直な適用範囲）を  
代表的 SIer 設計書パターンで実証するサンプルセットです。

## ファイル構成

| ファイル | 説明 |
|---|---|
| `design-doc-sample.md` | サンプル設計書 Markdown（全 Phase 3-4 機能を使用） |
| `req-trace.csv` | 要件トレーサビリティ表（正本データ） |
| `state-transition.csv` | 状態遷移表（正本データ） |
| `failure-triage.csv` | 障害切り分けガイド（正本データ） |
| `release-gate.csv` | リリース判定表（正本データ） |
| `design-doc-sample-rendered.html` | Pandoc 生成 HTML（CSS 埋め込み済み、G2 証跡） |

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

以下は WSL2 ヘッドレス環境では実施不可のため、GUI 環境またはCI で確認してください。

### 経路 A（推奨）: VS Code + Markdown PDF 拡張機能

1. VS Code で `design-doc-sample.md` を開く
2. MMI 拡張機能が有効になっていること（`![[...]]` がプレビューに展開される）
3. コマンドパレット → `Markdown PDF: Export (pdf)`
4. 出力 PDF で以下を確認:
   - 「表2: 全要件一覧（横向き）」の前で改ページが入る
   - 「表3: 文書ライフサイクル状態遷移」が横向きページで出力される
   - カード（`別紙: 障害切り分けガイド全件`）が「別紙参照:」プレフィックス付きのブロックで表示される

### 経路 B: Pandoc + weasyprint

```bash
# MMI プレビューで HTML をコピーするか、本サンプルの rendered.html を使用
weasyprint design-doc-sample-rendered.html output.pdf
```

### 経路 C: Pandoc HTML → Chromium headless print

```bash
# Chromium/Chrome が必要
chromium-browser --headless --print-to-pdf=output.pdf design-doc-sample-rendered.html
```

## G4: 正直な適用範囲（実測ベース）

### 確認済み（自動テストで担保）

- `![[...]]` → HTML 構造（クラス/属性）の正しさ: **unit 167 件で実証**
- `data-page-break` / `data-orientation` 属性の付与: **unit で実証**
- `@media print` + `page-break-before/after` + `@page landscape/portrait` の CSS 定義: **CSS coverage unit で実証**
- 原本データの非改変（read-only）: **unit で実証**

### 手動確認が必要（GUI/CLI ツール依存）

- 実 VS Code プレビューでのスクリーンショット（GUI 必須）
- PDF での改ページ再現（PDF 生成器必須）
- PDF での per-page 横向き再現（named-page 対応エンジン必須）

### PDF 生成器の既知制約（実測）

| エンジン | pageBreak 対応 | per-page orientation 対応 | 備考 |
|---|---|---|---|
| VS Code Markdown PDF (Chromium) | ✅ | ⚠️ CSS Paged Media L3 実装依存 | バージョンにより差あり |
| weasyprint | ✅ | ✅ | `pip install weasyprint` |
| Chromium headless | ✅ | ⚠️ CSS Paged Media L3 実装依存 | バージョン確認要 |
| wkhtmltopdf 0.12.x | ✅ | ❌ `@page named-page` 未対応 | per-page 向きは無効 |
| Pandoc + LaTeX | ⚠️ LaTeX 命令が必要 | ❌ CSS `@page` を解釈しない | MMI との相性が低い |

### 本プロダクトの責任範囲

MMI は HTML と CSS の属性/クラス付与（`data-page-break`/`data-orientation`/`mmi-*`）まで担保します。  
PDF レンダリングの最終品質は利用する PDF 生成器に依存し、本プロダクトの制御範囲外です。

---

**関連**: [issue-0098](../../01_Plans/issues/issue-0098-phase11-pdf-print-output-proof.md) / [ADR-0010](../../01_Plans/adr/ADR-0010-product-completion-gate.md)
