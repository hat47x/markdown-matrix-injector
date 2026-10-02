# Markdown Matrix Injector Reference

## この資料の使い方
初めて使う方は [チュートリアル](tutorial.md)、操作を調べる方は [利用マニュアル](user-manual.md) を参照してください。本書は記法の詳細を扱います。
最新の実機確認範囲は [検証記録](release-validation-2026-09-08.md) を正とします。

## Target reader
- 記法やクエリ仕様を正確に参照したい利用者
- サポート担当者、継続利用者、開発者

## Prerequisites
- 基本的な使い方は `overview.md` または `tutorial.md` で把握していること
- 埋め込み元としてCSV / XLSX / XML Spreadsheet 2003を利用すること

## Expected result
この文書を読むと、埋め込み記法、主要パラメータ、Smart Fallback、印刷制御、Diagnostics、入力支援機能について、一次回答に必要な「正常系挙動 / 代表的失敗ケース / 制約 / 関連正本リンク」を確認できます。

## issue-0018 受入条件（reference 本文対象に限定）

- 主要パラメータ群に「正常系挙動」「代表的な失敗ケース」「制約」「関連正本リンク」が記載されること。
- Smart Fallback / 印刷制御 / Diagnostics / Paste&D&Dの制約が `must` / `should` / `known limitation` で明文化されること。
- `reference.md` 単体で一次回答源として成立し、必要時に `00_Prompt` / `01_Plans` / `02_Architecture` / `03_Implement/test` へ遷移できること。
- docs auditでrepo内リンク切れがないこと。

### 正常系
- Referenceの主要機能ごとに「正常系挙動」「代表的失敗ケース」「制約」「関連正本リンク」を同一セクション内で示す。
- サポート担当が問い合わせに対し、Referenceへのリンクのみで一次回答できる粒度を維持する。

### 失敗時
- `filepath` 不在、`sheet` 不在、無効XML、不正パラメータ指定などの失敗時に、利用者が次アクションを判断できる説明を記載する。
- リポジトリ内の関連正本リンクが欠落している場合は、Referenceを一次回答源として扱わない。

### 制約
- 本書は公開向けリファレンスのため、実装詳細はコード/テスト/設計正本を優先する。
- UIの最終見た目（特に印刷結果）は環境依存のため、manual-e2eの確認を前提とする。

### 関連正本リンク
- 要件正本: `00_Prompt/requirements.md`
- 実行計画: `01_Plans/issues/issue-0018-phase6-reference-trustworthiness.md`
- architecture gate正本: `02_Architecture/phase6-public-documentation-architecture.md`
- 関連ADR:
  - `01_Plans/adr/ADR-0002-phase6-documentation-feedback-loop.md`
  - `01_Plans/adr/ADR-0003-phase6-user-value-maximization-roadmap.md`

## Embed syntax
基本記法は次のとおりです。

```text
![[<filepath>#<sheet_or_name>|<range>?<params>]]
```

主な意味は次のとおりです。
- `filepath`: 埋め込み元ファイル。
  - 正常系挙動: Markdownファイル基準の相対パスで対象ファイルを探索する。
  - 代表的失敗ケース: ファイルが存在しない。
  - 制約: 相対パス解決を優先し、必要時のみワークスペースルートへフォールバックする。
  - 関連正本: `00_Prompt/requirements.md`, `03_Implement/src`
- `sheet_or_name`: シート名またはターゲット名。
  - 正常系挙動: 指定シートを対象に範囲・パラメータを評価する。
  - 代表的失敗ケース: 指定シートが存在しない。
  - 制約: データソース種別により指定可能な名前空間が異なる。
  - 関連正本: `03_Implement/src`, `03_Implement/test`
- `range`: A1形式の範囲。
  - 正常系挙動: 指定範囲のみを抽出して後段パラメータを適用する。
  - 代表的失敗ケース: 範囲記法が不正。
  - 制約: 範囲が巨大な場合はSmart Fallbackが優先されることがある。
  - 関連正本: `03_Implement/src`, `03_Implement/test`
- `params`: URLクエリ形式の追加パラメータ。
  - 正常系挙動: サポート済みキーのみ評価して表示を組み立てる。
  - 代表的失敗ケース: 非サポートキー・値が指定される。
  - 制約: パラメータ競合時は実装側の評価順に従う。
  - 関連正本: `00_Prompt/requirements.md`, `03_Implement/src`

## Supported data sources
- CSV
- XLSX
- XML Spreadsheet 2003

### 正常系挙動
- CSV/XLSX/XML Spreadsheet 2003を入力として解析し、指定範囲またはシート全体を描画する。

### 代表的失敗ケース
- 汎用XML（Spreadsheet 2003でないXML）を渡すと、パースを中断してエラー表示になる。

### 制約
- XMLはSpreadsheet 2003のシグネチャ前提であり、汎用XML互換は対象外。
- データ正本は外部ファイルであり、本拡張はビューアとして扱う（編集機能は持たない）。
- CSVはRFC4180準拠（クォート内のカンマ・改行・`""`エスケープに対応）。CSV/TSVいずれも読み込み可能。
- XLSX/XMLのExcel日付型セルは `YYYY-MM-DD`（ISO 8601）で表示する（ロケール依存の曖昧な短縮表記
  `4/3/26` 等は使用しない）。日付以外の数値・テキストセルはこの変換の対象外（issue-0107）。

### 関連正本
- `00_Prompt/requirements.md`
- `02_Architecture/phase6-public-documentation-architecture.md`
- `03_Implement/src`
- `03_Implement/test`

## Query parameters（主要機能）

### mode
- 正常系挙動は次のとおりです。
  - `mode=table`: Smart Fallback条件に該当しても表展開を優先する。
  - `mode=card`: カード表示を強制する。
- 代表的失敗ケースは次のとおりです。
  - 未定義の値（例: `mode=list`）を指定すると期待表示にならない。
- 制約は次のとおりです。
  - 既定値（未指定時）はSmart Fallback判定に従う。
- 一次対応は次のとおりです。
  - 想定と異なる表示時は `mode` 指定有無を確認し、意図した表示を `mode=table` / `mode=card` で明示する。
  - 巨大表の可読性問題はSmart Fallbackセクションの制約と回避策へ誘導する。
- 関連正本は次のとおりです。
  - `00_Prompt/requirements.md`
  - `03_Implement/src`
  - `03_Implement/test`

### header
- 正常系挙動は次のとおりです。
  - `header=first` は範囲1行目をヘッダとして扱う。
  - `header=<number>` は指定行をヘッダとして結合する。
- 代表的失敗ケースは次のとおりです。
  - 範囲外の行番号を指定するとヘッダが期待通りに構成されない。
- 制約は次のとおりです。
  - データ形状によってはヘッダ化後に列名重複が発生しうる。
- 一次対応は次のとおりです。
  - ヘッダ不整合時は `header=first` と `header=<number>` を切り替えて再確認する。
  - 重複列名がある場合は元データ側の列名整備を優先し、Referenceでは運用回避として列選択（`columns`）を併用する。
- 関連正本は次のとおりです。
  - `00_Prompt/requirements.md`
  - `03_Implement/src`
  - `03_Implement/test`

### columns / transpose / grep
- 正常系挙動は次のとおりです。
  - `columns=A,C,F` は指定列のみ抽出する。
  - `transpose=true` は行列を反転する。
  - `grep=<keyword>` はキーワード一致行だけを残す。
- 代表的失敗ケースは次のとおりです。
  - 不正な列指定・空文字grepにより結果が空または期待外になる。
- 制約は次のとおりです。
  - フィルタ後のデータ件数が0の場合でもエラーではなく空表示になりうる。
- 一次対応は次のとおりです。
  - 結果が空の場合は `columns` 指定・`grep` キーワード・`transpose` 指定の順で1つずつ外し、原因パラメータを切り分ける。
  - 空表示が仕様内か不具合疑いかは `03_Implement/test` の該当テスト期待値で確認する。
- 関連正本は次のとおりです。
  - `00_Prompt/requirements.md`
  - `03_Implement/src`
  - `03_Implement/test`

### highlightColumn / highlightValue / formatColumn
- 正常系挙動は次のとおりです。
  - `highlightColumn` と `highlightValue` の一致行に強調クラスを付与する。
  - `formatColumn=<selector>:json` は対象セルをコードブロック風表示にする。
- 代表的失敗ケースは次のとおりです。
  - `highlightColumn` の列指定不整合、`formatColumn` のセレクタ不正で効果が出ない。
- 制約は次のとおりです。
  - JSON風表示は見た目整形であり、データ型変換を保証しない。
- 一次対応は次のとおりです。
  - 強調が効かない場合は列セレクタと比較値の大小文字・前後空白を見直す。
  - `formatColumn` 不整合時は対象列を単独指定で再現確認し、複合パラメータとの競合を除去する。
- 関連正本は次のとおりです。
  - `00_Prompt/requirements.md`
  - `03_Implement/src`
  - `03_Implement/test`

### caption / id / pageBreak / orientation
- 正常系挙動は次のとおりです。
  - `caption` は表題を付与し、`id` は相互参照アンカーとして利用できる。
  - `pageBreak` は印刷時改ページクラスを付与する。
  - `orientation` は印刷用CSSと連携する向きヒントを付与する。
- 代表的失敗ケースは次のとおりです。
  - 無効な `pageBreak`/`orientation` 値により期待した印刷制御が効かない。
- 制約は次のとおりです。
  - 実際の改ページ・用紙向きはPDF生成器や印刷環境の実装差分に依存する。
- 一次対応は次のとおりです。
  - 期待どおりに印刷制御できない場合は、まず画面表示でパラメータ解釈が成立しているかを確認する。
  - その後にPDF生成器差分（Pandoc / Markdown PDF / ブラウザ印刷）を切り分ける。
- 関連正本は次のとおりです。
  - `00_Prompt/requirements.md`
  - `02_Architecture/phase6-public-documentation-architecture.md`
  - `03_Implement/src`
  - `03_Implement/test`

## Print control（印刷制御）

対象パラメータ: `caption` / `id` / `pageBreak` / `orientation`

### 正常系挙動
- `caption` を付けると、埋め込みブロックに表題が表示される。
- `id` を付けると、Markdown内のアンカー参照で当該ブロックを参照できる。
- `pageBreak=before|after|both` を指定すると、印刷用クラスが付与され、PDF生成時の改ページ制御に利用できる。
- `orientation=landscape|portrait` を指定すると、印刷CSSと連携する向きヒントクラスが付与される。

### 代表的失敗ケース
- `pageBreak` に未定義値（例: `middle`）を指定すると、期待する改ページ制御が有効にならない。
- `orientation` に未定義値（例: `auto`）を指定すると、向き制御が適用されない。
- `id` の重複を放置すると、参照リンクの解決先が不安定になる。

### 制約
- 仕様制約（must）:
  - 本機能は印刷補助であり、外部ファイルの内容編集は行わない（ビューア専用）。
- 運用制約（should）:
  - 画面表示で期待どおりでも、印刷結果はmanual-e2eで都度確認する。
  - HTML出力の `data-page-break` / `data-orientation` 属性の付与は自動テストで実証済み。PDFへの反映は利用するPDF生成器に依存する。
- known limitation:
  - `@page named-page` per-page横向き（`orientation=landscape`）は、weasyprint / Chromium系では対応するがwkhtmltopdf 0.12.x / Pandoc+LaTeXでは非対応。
  - `pageBreak` はChromium系・weasyprintで対応。Pandoc+LaTeXバックエンドではCSS `@media print` が解釈されない。
  - 今回の確認済み経路: **MMIで展開済みのHTML → WeasyPrint 69.0**。VS Code Markdown PDF拡張による直接出力は未検証であり、プレビューが表示できるだけではPDFへの展開を保証しない。
  - 詳細なPDF生成器別対応表: `04_Documentation/samples/sier-design/README.md`。
- 既知制約（known limitation）:
  - 改ページと用紙向きの最終結果は、Pandoc / Markdown PDF / ブラウザ印刷の実装差に依存する。

### 一次対応
- `pageBreak`/`orientation` が効かない場合は、値の妥当性（`before|after|both`, `landscape|portrait`）を先に確認する。
- `id` 参照の不安定さは重複ID有無を調べ、重複排除を優先する。
- 解決しない場合は `issue-0006-phase3-caption-and-print-control.md` を起点に既知課題を確認する。

### 関連正本
- `00_Prompt/requirements.md`
- `01_Plans/issues/issue-0006-phase3-caption-and-print-control.md`
- `02_Architecture/phase6-public-documentation-architecture.md`
- `03_Implement/src/core/renderEmbedFrame.ts`
- `03_Implement/test/markdownMatrixPlugin.test.ts`

## Smart Fallback

### 正常系挙動
- 以下の条件でカード化（またはカード優先）される。
  - `mode=card` 指定時
  - 列数 > 10またはセル数 > 500
  - シート指定なしでファイル全体を参照
- `mode=table` 指定時は、閾値超過でもテーブル展開を優先する。

### 代表的失敗ケース
- `mode=table` 強制時に巨大表を展開し、表示や可読性が低下する（機能不全ではなく運用上の失敗）。
- シート未指定のまま巨大ファイルを参照し、意図せずカード化される。

### 制約
- 仕様制約（must）:
  - 可読性を優先するため、常に全文展開はしない。
- 運用制約（should）:
  - 画面（`@media screen`）と印刷（`@media print`）で表示形態が変わる点を、レビュー時に明示する。
- 既知制約（known limitation）:
  - 発動閾値（列数・セル数）は実装基準に従うため、将来変更時は実装/テスト正本を優先する。

### 一次対応
- 意図せずカード化された場合は `mode=table` を明示し、可読性と性能のトレードオフを利用者に説明する。
- 巨大表で表示が重い場合は `range`/`columns`/`grep` で対象データを縮小する。
- 閾値関連の問い合わせは `smartFallback.ts` と `smartFallback.test.ts` の現行仕様を一次根拠に案内する。

### 関連正本
- `00_Prompt/requirements.md`
- `01_Plans/issues/issue-0007-phase4-smart-fallback.md`
- `01_Plans/issues/issue-0008-smart-fallback-short-circuit.md`
- `02_Architecture/phase6-public-documentation-architecture.md`
- `03_Implement/src/core/smartFallback.ts`
- `03_Implement/test/smartFallback.test.ts`

## Diagnostics（静的解析）

### 正常系挙動
- Diagnosticsは「ファイル不在」「シート不在」「無効XML」を検知し、問題位置を通知する。
- ProblemsパネルにErrorレベルで報告され、対象記法位置の修正判断を支援する。

### 代表的失敗ケース
- Diagnosticsの対象外パターンは手動確認が必要になる。
- ワークスペース外参照や曖昧な相対パス指定では、想定と異なる診断結果になる場合がある。

### 制約
- 仕様制約（must）:
  - 診断結果は「修正候補の提示」であり、正本データの整合性を自動修復しない。
- 運用制約（should）:
  - Diagnosticsで解決しない表示問題はmanual-e2eと実データ確認を併用して切り分ける。
- 既知制約（known limitation）:
  - Diagnosticsは静的観点中心で、印刷結果や運用ワークフロー全体を保証しない。

### 一次対応
- エラー発生時は「ファイル存在確認 → シート存在確認 → XML形式確認」の順で切り分ける。
- 相対パス起因の誤検知疑いは、Markdown基準パスとworkspaceルート基準の差分を確認する。
- 対象外パターンは `diagnostics.test.ts` に再現テストがあるかを確認し、なければissue化を検討する。

### 関連正本
- `00_Prompt/requirements.md`
- `01_Plans/issues/issue-0010-phase5-native-paste-drop-provider.md`
- `03_Implement/src/dx/diagnostics.ts`
- `03_Implement/test/diagnostics.test.ts`

## Paste & D&D（入力支援）

### 正常系挙動
- PasteはクリップボードのHTMLメタデータ（Excel / Google Sheets由来など）を解析し、埋め込み記法の候補を生成する。
- D&Dはdropped filesを基に `![[...]]` 記法を生成し、執筆時の入力工数を削減する。
- 補助生成後は、必要に応じて `sheet` / `range` / `params` を追記して精密化できる。

### 代表的失敗ケース
- クリップボードのメタデータが不足していると、Paste補助が最小限（ファイルパスのみ等）になる。
- D&D対象が未サポート形式の場合、期待する記法展開にならない。
- パス解決基準（編集中Markdown基準）と利用者の想定がずれると、挿入直後にdiagnostics errorとなる。

### 制約
- 仕様制約（must）:
  - Paste / D&Dは「入力支援」であり、生成記法の正当性を100%保証しない。
- 運用制約（should）:
  - 大規模ファイルや複雑なシート構造では、手動での補正を前提とする。
- 既知制約（known limitation）:
  - 実行環境（VS Code / 拡張ホスト）の差分で取得可能なメタデータが異なる。

### 一次対応
- 期待する展開にならない場合は、生成直後の `![[...]]` を手動で補正しDiagnosticsを再実行する。
- メタデータ不足時はまずファイルパスのみで挿入し、`#sheet|range?params` を段階的に追加する。
- 未サポート形式はD&Dではなく手入力 + Autocompleteに切り替える。

### 関連正本
- `00_Prompt/requirements.md`
- `01_Plans/issues/issue-0010-phase5-native-paste-drop-provider.md`
- `03_Implement/src/dx/pasteDrop.ts`
- `03_Implement/test/pasteDrop.test.ts`

## Preview Styles（プレビュースタイル）

### 正常系挙動
- VS Code Markdownプレビューは、`contributes.markdown.previewStyles` で宣言された `media/markdown-matrix.css` を自動読み込みする。
- 表・カード・エラー表示・ハイライト・印刷制御（`@media print`）は、このスタイルシートによって適用される。

### 適用されるクラス/属性の一覧
| クラス / 属性 | 用途 |
|---|---|
| `.mmi-embed` / `[data-page-break]` / `[data-orientation]` | 埋め込みフレーム（改ページ・向き制御） |
| `.mmi-embed__caption` | キャプション表示 |
| `.mmi-table` / `.mmi-table__row--highlight` | テーブル・ハイライト行 |
| `.mmi-table__cell--formatted` / `.mmi-table__cell-code` | コードブロック列 |
| `.mmi-card` / `.mmi-card__title` / `.mmi-card__meta` | カード UI（見出しは正本への相対パスリンク） |
| `.mmi-card__open` | カードの「外部アプリで開く」ボタン（拡張URI、印刷時は非表示。ADR-0015。実機検証範囲は検証記録を参照） |
| `.mmi-error` | エラー表示 |

### 制約
- 仕様制約（must）: スタイルはVS Codeプレビュー内のみ適用される。他レンダラ（Obsidian等）は未対応。
- known limitation: VS Codeテーマ変数（`--vscode-*`）が未定義の環境ではフォールバック値が適用される。

### 関連正本
- `03_Implement/media/markdown-matrix.css`
- `03_Implement/package.json` (`contributes.markdown.previewStyles`)
- `03_Implement/test/previewStyles.test.ts`（CSSカバレッジunit test）
- ADR: `01_Plans/adr/ADR-0010-product-completion-gate.md`（G1品質ゲート）

---

## Autocomplete（補完）

### 正常系挙動
- `![[` 入力後、`filepath` → `#` → `sheet/range` → `?` → `parameter` の順で候補を段階提示する。
- 既存記法の途中編集でも、コンテキストに応じた候補に絞り込まれる。

### 代表的失敗ケース
- 候補算出に必要な情報（対象ファイルやシート情報）が不足すると、提案数が減る/空になる。

### 制約
- 補完は記述支援であり、確定後の正当性はDiagnosticsとテストで確認する。
- 補完候補の網羅性は実装バージョン依存のため、最終仕様は実装/テスト正本を優先する。

### 関連正本
- `00_Prompt/requirements.md`
- `03_Implement/src/dx/autocompleteProvider.ts`
- `03_Implement/test/autocompleteProvider.test.ts`

## Commands（コマンド）

VS Codeコマンドパレットから利用できる主要コマンド:

| コマンド | ID | 用途 |
|---|---|---|
| MMI: Generate Delivery Manifest | `markdownMatrixInjector.generateDeliveryManifest` | 開いている Markdown 内で「別紙（カード）」として扱われる埋め込みを抽出し、納品チェックリスト CSV（`<filename>.delivery-manifest.csv`）を同じフォルダへ出力する（要件 Phase 4）。 |
| MMI: Open Embed Source | `markdownMatrixInjector.openSource` | 表データの絶対パスを引数として受け取り、OS既定アプリへ渡す。カードはADR-0015の拡張URIハンドラーから同じ処理を呼ぶ。信頼済みローカルワークスペース内の対応形式のみ許可し、realpathで境界を確認する。引数なしのパレット実行は対象を選ぶ操作ではない。 |
| MMI: Insert Embed From Paste | `markdownMatrixInjector.insertEmbedFromPaste` | クリップボードから埋め込み記法を生成・挿入する。 |
| MMI: Insert Embed From Drop | `markdownMatrixInjector.insertEmbedFromDrop` | ドロップしたファイルから埋め込み記法を生成・挿入する。 |
| MMI: Insert Embed by Content Match | `markdownMatrixInjector.insertEmbedByContentMatch` | クリップボードの値（TSV）でワークスペース内のワークブック（`**/*.{xlsx,xls,csv,xml}`、`node_modules`/`dist`除外、最大`MAX_CONTENT_MATCH_WORKSPACE_FILES`件）を検索し、一致する範囲を候補として提示する。Excelのセルコピーは元ファイルの場所を含まないため、上記2コマンド（パス依存）が使えない場合の代替経路。結果が1件でも複数件でも`showQuickPick`による明示選択を必ず経る（自動確定しない）。同じ検索は`editor.action.pasteAs`（Ctrl+.）からも呼ばれる（下記）。通常の自動貼り付け（Ctrl+V）へは統合されていない（自動適用によるR1違反リスクを避けるため）。 |

### `editor.action.pasteAs`（Paste As...、既定 Ctrl+.）との統合
`registerDocumentPasteEditProvider`は`context.triggerKind === DocumentPasteTriggerKind.PasteAs`のときだけ、内容照合の候補を追加で返す。VS Code標準の「挿入前に選ぶ」ドロップダウンに候補が並ぶため、独自UIを実装せずR1（自動確定しない）を満たす。通常のCtrl+V（`triggerKind: Automatic`）ではこの検索を一切行わない——`Automatic`では複数の`DocumentPasteEdit`のうち最初の1件が即座に自動適用される仕様のため、そこに含めると未確認の推測が本文へ入ってしまうリスクがある。単一スカラー値（単語・URL等）の貼り付けでは、ワークスペースへのアクセス自体が発生しない（`looksLikeTabularClipboard`によるゲート）。

### Generate Delivery Manifest の挙動
- 正常系挙動: `mode=card` 指定、列数10超、セル数500超、シート未指定（ファイル全体参照）で「別紙」となった埋め込みを1行ずつCSV化する（列: `sourcePath, sheet, range, reason, caption, id`）。
- 代表的失敗ケース: 別紙対象が0件の場合はCSVを書かず通知のみ。未保存ファイルでは保存を促す。リンク切れ・シート不在の埋め込みはDiagnostics対象であり、マニフェストには含めない。
- 制約: 出力はread-onlyビューアの補助であり、正本データは改変しない。
- 関連正本: `03_Implement/src/manifest/collectDeliveryManifest.ts`, `03_Implement/src/manifest/generateDeliveryManifest.ts`, `03_Implement/test/collectDeliveryManifest.test.ts`
- 出力例: `04_Documentation/samples/sier-design/design-doc-sample.delivery-manifest.csv`

## Cross-reference map（01_Plans / 02_Architecture / 03_Implement/test）
- 要件正本: `00_Prompt/requirements.md`
- 計画（Issue/ADR）:
  - `01_Plans/issues/issue-0018-phase6-reference-trustworthiness.md`
  - `01_Plans/adr/ADR-0002-phase6-documentation-feedback-loop.md`
  - `01_Plans/adr/ADR-0003-phase6-user-value-maximization-roadmap.md`
  - `01_Plans/adr/ADR-0010-product-completion-gate.md`（G1〜G4品質ゲート）
- 設計は次のとおりです。
  - `02_Architecture/phase6-public-documentation-architecture.md`
  - `02_Architecture/vscode-extension-host-e2e.md`（preview automation scope）
- 実装/テストは次のとおりです。
  - `03_Implement/src`
  - `03_Implement/test`
  - `03_Implement/media/markdown-matrix.css`（preview styles）
- エンタープライズ出力サンプル（G2/G4 証跡）:
  - `04_Documentation/samples/sier-design/README.md`

## Related docs
- **記法仕様（規範）**: `04_Documentation/spec/mmi-notation-v1.md` — 本Referenceの挙動記述の正本。齟齬がある場合は仕様書が優先する
- 機械可読契約: `04_Documentation/spec/params.schema.json` / conformance corpus: `03_Implement/test/conformance/cases.json`
- 概要: `04_Documentation/overview.md`
- チュートリアル: `04_Documentation/tutorial.md`
- 業務シナリオ: `04_Documentation/scenario-sier-design-docs.md`
- E2E運用: `04_Documentation/vscode-e2e-testing.md`

## FAQ（Reference）
### Q1. どのパラメータから確認すれば切り分けが早いですか？
A1. まず `filepath / sheet / range` の存在確認を行い、その後 `header`、`columns`、`grep`、最後に `highlight/format` の順で確認すると切り分けが速くなります。

### Q2. `orientation=landscape` を指定しても横向きになりません。
A2. パラメータ解釈が成功していても、最終的な向きはPDF生成器依存です。画面でクラス付与を確認し、生成器側の印刷設定差分を調査してください。

### Q3. XML が常に失敗するのはなぜですか？
A3. 本ツールはXML Spreadsheet 2003のみ対象です。汎用XMLはフェイルセーフでエラー表示になります。

## Known limitations
- Referenceは公開文書向けに要点を整理したものであり、将来的にFAQ / troubleshooting / sample galleryへ分割する可能性がある。
- 実機UIの見た目確認は、manual-e2eやスクリーンショット整備が別途必要。
- 本書は一次回答源だが、最終判断は `00_Prompt/requirements.md` と実装・テスト正本（`03_Implement/src`, `03_Implement/test`）を優先する。

## docs audit（repo 内リンク健全性の確認結果）
- 実施内容: `04_Documentation/reference.md` 内のrepo相対パスを抽出し、実在ファイルと照合。
- 結果: 参照したrepo相対パスはすべて解決可能（未解決は説明用トークン `sheet/range` のみで、リンク対象ではない）。
- 備考: 継続運用時はdocs変更ごとに同監査を再実施する。

## 結果要約（Stream E）
- Task 1: issue-0018とarchitecture gateの対応表を本書に固定した。
- Task 2: 主要機能カードへ「一次対応」を追加し、一次回答導線を明確化した。
- Task 3: Smart Fallback / 印刷制御 / Diagnostics / Paste&D&Dの制約を `must/should/known limitation` に分類して強化した。
- Task 4: repo内リンク健全性チェック結果を記録した。
- Task 5: 本節に結果要約を集約した。
