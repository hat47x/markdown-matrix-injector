# Markdown Matrix Injector Reference

## Publication
- Public Gist: [https://gist.github.com/<YOUR_GITHUB_ACCOUNT>/mmi-reference](https://gist.github.com/<YOUR_GITHUB_ACCOUNT>/mmi-reference)
- Canonical source: `04_Documentation/reference.md`

## Target reader
- 記法やクエリ仕様を正確に参照したい利用者
- サポート担当者、継続利用者、開発者

## Prerequisites
- 基本的な使い方は `overview.md` または `tutorial.md` で把握していること
- 埋め込み元として CSV / XLSX / XML Spreadsheet 2003 を利用すること

## Expected result
この文書を読むと、埋め込み記法、主要パラメータ、Smart Fallback、印刷制御、Diagnostics、入力支援機能について、一次回答に必要な「正常系挙動 / 代表的失敗ケース / 制約 / 関連正本リンク」を確認できます。

## issue-0018 受入条件（固定）

### 正常系
- Reference の主要機能ごとに「正常系挙動」「代表的失敗ケース」「制約」「関連正本リンク」を同一セクション内で示す。
- サポート担当が問い合わせに対し、Reference へのリンクのみで一次回答できる粒度を維持する。

### 失敗時
- `filepath` 不在、`sheet` 不在、無効 XML、不正パラメータ指定などの失敗時に、利用者が次アクションを判断できる説明を記載する。
- リポジトリ内の関連正本リンクが欠落している場合は、Reference を一次回答源として扱わない。

### 制約
- 本書は公開向けリファレンスのため、実装詳細はコード/テスト/設計正本を優先する。
- UI の最終見た目（特に印刷結果）は環境依存のため、manual-e2e の確認を前提とする。

### 関連正本リンク
- 要件正本: `00_Prompt/requirements.md`
- 実行計画: `01_Plans/issues/issue-0018-phase6-reference-trustworthiness.md`
- 関連ADR:
  - `01_Plans/adr/ADR-0002-phase6-documentation-feedback-loop.md`
  - `01_Plans/adr/ADR-0003-phase6-user-value-maximization-roadmap.md`

## Embed syntax
基本記法:

```text
![[<filepath>#<sheet_or_name>|<range>?<params>]]
```

主な意味:
- `filepath`: 埋め込み元ファイル。
  - 正常系挙動: Markdown ファイル基準の相対パスで対象ファイルを探索する。
  - 代表的失敗ケース: ファイルが存在しない。
  - 制約: 相対パス解決を優先し、必要時のみワークスペースルートへフォールバックする。
  - 関連正本: `00_Prompt/requirements.md`, `03_Implement/src`
- `sheet_or_name`: シート名またはターゲット名。
  - 正常系挙動: 指定シートを対象に範囲・パラメータを評価する。
  - 代表的失敗ケース: 指定シートが存在しない。
  - 制約: データソース種別により指定可能な名前空間が異なる。
  - 関連正本: `03_Implement/src`, `03_Implement/test`
- `range`: A1 形式の範囲。
  - 正常系挙動: 指定範囲のみを抽出して後段パラメータを適用する。
  - 代表的失敗ケース: 範囲記法が不正。
  - 制約: 範囲が巨大な場合は Smart Fallback が優先されることがある。
  - 関連正本: `03_Implement/src`, `03_Implement/test`
- `params`: URL クエリ形式の追加パラメータ。
  - 正常系挙動: サポート済みキーのみ評価して表示を組み立てる。
  - 代表的失敗ケース: 非サポートキー・値が指定される。
  - 制約: パラメータ競合時は実装側の評価順に従う。
  - 関連正本: `00_Prompt/requirements.md`, `03_Implement/src`

## Supported data sources
- CSV
- XLSX
- XML Spreadsheet 2003

### 正常系挙動
- CSV/XLSX/XML Spreadsheet 2003 を入力として解析し、指定範囲またはシート全体を描画する。

### 代表的失敗ケース
- 汎用 XML（Spreadsheet 2003 でない XML）を渡すと、パースを中断してエラー表示になる。

### 制約
- XML は Spreadsheet 2003 のシグネチャ前提であり、汎用 XML 互換は対象外。
- データ正本は外部ファイルであり、本拡張はビューアとして扱う（編集機能は持たない）。

### 関連正本
- `00_Prompt/requirements.md`
- `02_Architecture/phase6-public-documentation-architecture.md`
- `03_Implement/src`
- `03_Implement/test`

## Query parameters（主要機能）

### mode
- 正常系挙動:
  - `mode=table`: Smart Fallback 条件に該当しても表展開を優先する。
  - `mode=card`: カード表示を強制する。
- 代表的失敗ケース:
  - 未定義の値（例: `mode=list`）を指定すると期待表示にならない。
- 制約:
  - 既定値（未指定時）は Smart Fallback 判定に従う。
- 関連正本:
  - `00_Prompt/requirements.md`
  - `03_Implement/src`
  - `03_Implement/test`

### header
- 正常系挙動:
  - `header=first` は範囲1行目をヘッダとして扱う。
  - `header=<number>` は指定行をヘッダとして結合する。
- 代表的失敗ケース:
  - 範囲外の行番号を指定するとヘッダが期待通りに構成されない。
- 制約:
  - データ形状によってはヘッダ化後に列名重複が発生しうる。
- 関連正本:
  - `00_Prompt/requirements.md`
  - `03_Implement/src`
  - `03_Implement/test`

### columns / transpose / grep
- 正常系挙動:
  - `columns=A,C,F` は指定列のみ抽出する。
  - `transpose=true` は行列を反転する。
  - `grep=<keyword>` はキーワード一致行だけを残す。
- 代表的失敗ケース:
  - 不正な列指定・空文字 grep により結果が空または期待外になる。
- 制約:
  - フィルタ後のデータ件数が 0 の場合でもエラーではなく空表示になりうる。
- 関連正本:
  - `00_Prompt/requirements.md`
  - `03_Implement/src`
  - `03_Implement/test`

### highlightColumn / highlightValue / formatColumn
- 正常系挙動:
  - `highlightColumn` と `highlightValue` の一致行に強調クラスを付与する。
  - `formatColumn=<selector>:json` は対象セルをコードブロック風表示にする。
- 代表的失敗ケース:
  - `highlightColumn` の列指定不整合、`formatColumn` のセレクタ不正で効果が出ない。
- 制約:
  - JSON風表示は見た目整形であり、データ型変換を保証しない。
- 関連正本:
  - `00_Prompt/requirements.md`
  - `03_Implement/src`
  - `03_Implement/test`

### caption / id / pageBreak / orientation
- 正常系挙動:
  - `caption` は表題を付与し、`id` は相互参照アンカーとして利用できる。
  - `pageBreak` は印刷時改ページクラスを付与する。
  - `orientation` は印刷用 CSS と連携する向きヒントを付与する。
- 代表的失敗ケース:
  - 無効な `pageBreak`/`orientation` 値により期待した印刷制御が効かない。
- 制約:
  - 実際の改ページ・用紙向きは PDF 生成器や印刷環境の実装差分に依存する。
- 関連正本:
  - `00_Prompt/requirements.md`
  - `02_Architecture/phase6-public-documentation-architecture.md`
  - `03_Implement/src`
  - `03_Implement/test`

## Print control（印刷制御）

対象パラメータ: `caption` / `id` / `pageBreak` / `orientation`

### 正常系挙動
- `caption` を付けると、埋め込みブロックに表題が表示される。
- `id` を付けると、Markdown 内のアンカー参照で当該ブロックを参照できる。
- `pageBreak=before|after|both` を指定すると、印刷用クラスが付与され、PDF 生成時の改ページ制御に利用できる。
- `orientation=landscape|portrait` を指定すると、印刷 CSS と連携する向きヒントクラスが付与される。

### 代表的失敗ケース
- `pageBreak` に未定義値（例: `middle`）を指定すると、期待する改ページ制御が有効にならない。
- `orientation` に未定義値（例: `auto`）を指定すると、向き制御が適用されない。
- `id` の重複を放置すると、参照リンクの解決先が不安定になる。

### 制約
- 改ページと用紙向きの最終結果は、Pandoc / Markdown PDF / ブラウザ印刷の実装差に依存する。
- 画面表示で期待どおりでも、印刷結果は manual-e2e で都度確認する前提。
- 本機能は印刷補助であり、外部ファイルの内容編集は行わない（ビューア専用）。

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
  - 列数 > 10 またはセル数 > 500
  - シート指定なしでファイル全体を参照
- `mode=table` 指定時は、閾値超過でもテーブル展開を優先する。

### 代表的失敗ケース
- `mode=table` 強制時に巨大表を展開し、表示や可読性が低下する（機能不全ではなく運用上の失敗）。
- シート未指定のまま巨大ファイルを参照し、意図せずカード化される。

### 制約
- 画面（`@media screen`）と印刷（`@media print`）で表示形態が変わる。
- 可読性を優先するため、常に全文展開はしない。
- 発動閾値（列数・セル数）は実装基準に従うため、将来変更時は実装/テスト正本を優先する。

### 関連正本
- `00_Prompt/requirements.md`
- `01_Plans/issues/issue-0007-phase4-smart-fallback.md`
- `01_Plans/issues/issue-0008-smart-fallback-short-circuit.md`
- `02_Architecture/phase6-public-documentation-architecture.md`
- `03_Implement/src/core/smartFallback.ts`
- `03_Implement/test/smartFallback.test.ts`

## Diagnostics（静的解析）

### 正常系挙動
- Diagnostics は「ファイル不在」「シート不在」「無効 XML」を検知し、問題位置を通知する。
- Problems パネルに Error レベルで報告され、対象記法位置の修正判断を支援する。

### 代表的失敗ケース
- Diagnostics の対象外パターンは手動確認が必要になる。
- ワークスペース外参照や曖昧な相対パス指定では、想定と異なる診断結果になる場合がある。

### 制約
- Diagnostics は静的観点中心で、印刷結果や運用ワークフロー全体までは保証しない。
- 診断結果は「修正候補の提示」であり、正本データの整合性を自動修復する機能ではない。

### 関連正本
- `00_Prompt/requirements.md`
- `01_Plans/issues/issue-0010-phase5-native-paste-drop-provider.md`
- `03_Implement/src/dx/diagnostics.ts`
- `03_Implement/test/diagnostics.test.ts`

## Paste & D&D（入力支援）

### 正常系挙動
- Paste はクリップボードの HTML メタデータ（Excel / Google Sheets 由来など）を解析し、埋め込み記法の候補を生成する。
- D&D は dropped files を基に `![[...]]` 記法を生成し、執筆時の入力工数を削減する。
- 補助生成後は、必要に応じて `sheet` / `range` / `params` を追記して精密化できる。

### 代表的失敗ケース
- クリップボードのメタデータが不足していると、Paste 補助が最小限（ファイルパスのみ等）になる。
- D&D 対象が未サポート形式の場合、期待する記法展開にならない。
- パス解決基準（編集中 Markdown 基準）と利用者の想定がずれると、挿入直後に diagnostics error となる。

### 制約
- Paste / D&D は「入力支援」であり、生成記法の正当性を100%保証しない。
- 大規模ファイルや複雑なシート構造では、手動での補正が前提になる。
- 実行環境（VS Code / 拡張ホスト）の差分で取得可能なメタデータが異なる。

### 関連正本
- `00_Prompt/requirements.md`
- `01_Plans/issues/issue-0010-phase5-native-paste-drop-provider.md`
- `03_Implement/src/dx/pasteDrop.ts`
- `03_Implement/test/pasteDrop.test.ts`

## Autocomplete（補完）

### 正常系挙動
- `![[` 入力後、`filepath` → `#` → `sheet/range` → `?` → `parameter` の順で候補を段階提示する。
- 既存記法の途中編集でも、コンテキストに応じた候補に絞り込まれる。

### 代表的失敗ケース
- 候補算出に必要な情報（対象ファイルやシート情報）が不足すると、提案数が減る/空になる。

### 制約
- 補完は記述支援であり、確定後の正当性は Diagnostics とテストで確認する。
- 補完候補の網羅性は実装バージョン依存のため、最終仕様は実装/テスト正本を優先する。

### 関連正本
- `00_Prompt/requirements.md`
- `03_Implement/src/dx/autocompleteProvider.ts`
- `03_Implement/test/autocompleteProvider.test.ts`

## Cross-reference map（01_Plans / 02_Architecture / 03_Implement/test）
- 要件正本: `00_Prompt/requirements.md`
- 計画（Issue/ADR）:
  - `01_Plans/issues/issue-0018-phase6-reference-trustworthiness.md`
  - `01_Plans/adr/ADR-0002-phase6-documentation-feedback-loop.md`
  - `01_Plans/adr/ADR-0003-phase6-user-value-maximization-roadmap.md`
- 設計:
  - `02_Architecture/phase6-public-documentation-architecture.md`
- 実装/テスト:
  - `03_Implement/src`
  - `03_Implement/test`

## Related docs
- 概要: `04_Documentation/overview.md`
- チュートリアル: `04_Documentation/tutorial.md`
- 業務シナリオ: `04_Documentation/scenario-sier-design-docs.md`
- E2E 運用: `04_Documentation/vscode-e2e-testing.md`

## Known limitations
- Reference は公開文書向けに要点を整理したものであり、将来的に FAQ / troubleshooting / sample gallery へ分割する可能性がある。
- 実機 UI の見た目確認は、manual-e2e やスクリーンショット整備が別途必要。
- 本書は一次回答源だが、最終判断は `00_Prompt/requirements.md` と実装・テスト正本（`03_Implement/src`, `03_Implement/test`）を優先する。
