# 要件定義書: Markdown Matrix Injector

## 0. プロジェクトの背景と設計思想 (Philosophy & Intent)
**【解決すべき課題】**
SIerにおける設計書は、Excel方眼紙や数百ページのWordのようなモノリス構造のバイナリ形式が採用されがちであり、AIエージェント開発との適合性が低い。一方で標準的なMarkdown文書は、エンジニアリング的文書に要求されるテーブルおよびマトリクス表現に著しく弱いという弱点を有する。これを解決するために、Markdownをメインのテキストとし、補助資料のExcelをリンクとして差し込むといった文書構造が求められる。
納品文書の品質に関しては、単なるデータの表示にとどまらず、Word文書からの移行を可能にするエンタープライズ品質のレイアウトと、PDF出力時の印刷制御機能が必要である。

**【本プラグインのミッション】**
外部データソース（Excel, CSV, XML）を「Single Source of Truth（正本）」とし、Markdownプレビュー上に必要な文脈だけをスライスして動的にインライン表示する「ドキュメント構築のクエリエンジン」を提供する。
本ツールは編集機能を持たない「ビューア」に徹することでデータの完全性を守り、Wordの代替に耐えうるエンタープライズ品質の出力レイアウトを実現する。

---

## 1. 開発フェーズ定義
AIエージェントは、以下のPhase順に実装とテストを完了させること。

* **Phase 1: コアエンジンとパフォーマンス基盤 (Core Viewer & Cache)**
    * 対象: 独自記法パース、CSV/Excel/XML読み込み、アグレッシブ・キャッシュ、厳密な相対パス解決。
* **Phase 2: クエリ言語としての拡張 (Advanced Query Parameters)**
    * 対象: `mode`, `header`, `columns`, `transpose`, `grep`, `highlight`, `format` によるデータスライス。
* **Phase 3: 脱Word・エンタープライズ印刷制御 (Word Migration & Print Control)**
    * 対象: `caption`, `id` による図表管理。`pageBreak`, `orientation` によるPDFレイアウト制御。
* **Phase 4: SIer納品品質の担保 (Smart Fallback & Delivery)**
    * 対象: 巨大表・作図のカード化（縮退表示）、納品マニフェスト出力コマンド。
* **Phase 5: 開発者体験と品質保証 (DX & Diagnostics)**
    * 対象: オートコンプリート、リンク切れエラー検知（Diagnostics）、クリップボード解析を伴う Paste/D&D。
* **Phase 6: 公開ドキュメント体系化と価値訴求 (Public Documentation & Adoption)**
    * 対象: 一般向け概要、導入チュートリアル、活用シナリオ、詳細仕様リファレンス、文書化による要件/設計/テストへのフィードバックループ。

---

## 2. 詳細仕様と実装の意図

### 【Phase 1】 コアエンジンとパフォーマンス基盤
* **Syntax**: `![[<filepath>#<sheet_or_name>|<range>?<params>]]`
* **パス解決**: 現在のMarkdownファイルからの相対パスを最優先とし、フォールバックでワークスペースルートを試行する。
* **キャッシュ機構**: 巨大ファイルによるフリーズを防ぐため、ファイルの最終更新日時（mtime）をキーにしたオンメモリキャッシュ（パース済みWorkbookオブジェクトの使い回し）を必須とする。
* **XMLフェイルセーフ**: `.xml` は「XML Spreadsheet 2003」を想定。先頭シグネチャ（`<?mso-application progid="Excel.Sheet"?>`等）を検証し、汎用XMLの場合はパースを中断しエラーUIを描画する。

### 【Phase 2】 クエリ言語としての拡張
URLクエリストリング形式（`?key=val&...`）でデータを切り出す。
* **`mode`**: `card` (強制カード化), `table` (強制展開)。未指定はSmart Fallback。
* **`header`**: `none` (デフォルト), `first` (範囲の1行目をヘッダ化), `{数値}` (そのシートの指定行を結合)。
* **`columns`**: 例 `A,C,F`。指定列のみ抽出。
* **`transpose`**: `true` で行列を反転。
* **`grep`**: 例 `grep=AUTH`。キーワードを含む行のみ抽出。
* **`highlightColumn` / `highlightValue`**: 一致する行にCSSクラス（ハイライト）を付与。
* **`formatColumn`**: 例 `E:json`。指定列のセルをコードブロックとして描画。

### 【Phase 3】 脱Word・エンタープライズ印刷制御
Word文書からの移行と、Pandoc/Markdown PDF等の出力ツールとの協調を実現する。
* **`caption`**: 例 `caption=状態遷移表`。表の上部にキャプション（`<figcaption>`等）を付与する。
* **`id`**: 例 `id=tbl-state`。コンテナにIDを付与し、Markdown内の相互参照（アンカーリンク）を可能にする。
* **`pageBreak`**: `before`, `after`, `both`。出力するHTMLコンテナに `page-break-before: always;` 等のCSSを付与し、PDFの改ページを強制する。
* **`orientation`**: `landscape`, `portrait`。特定のCSSクラスを付与し、印刷用CSS（`@page` ルール）と連携してそのページのみ用紙の向きを制御する。

### 【Phase 4】 SIer納品品質の担保 (Smart Fallback)
* **発動条件**: [A] 列数10超 or セル数500超（※`mode=table`指定時は強制展開）。 [B] シート指定のないファイル全体。 [C] `mode=card` 指定時。
* **画面UI (`@media screen`)**: 「ファイル名・範囲・開くボタン」を持つリッチなリンクカードUI（クリックで `env.openExternal`）。
* **印刷UI (`@media print`)**: カードUIを非表示にし、納品文書として違和感のない「別紙参照ブロック（罫線表）」へ動的に変形させる。
* **マニフェスト出力**: `Generate Delivery Manifest` コマンドで、別紙扱いとなったファイル群を納品用チェックリスト（CSV）として出力する。

### 【Phase 5】 開発者体験と品質保証 (DX & Diagnostics)
* **Autocomplete**: `![[` 入力時から、ファイル名 → `#` → シート/範囲 → `?` → パラメータ までを段階的にサジェスト。
* **Diagnostics (静的解析)**: リンクを検証。「ファイル不在」「シート不在」「無効なXML」の場合、該当箇所に赤波線（Error）を引き Problemsパネルに通知。
* **Paste & D&D**: D&Dでのリンク挿入。ペースト時はExcel, Google Sheets等からのHTMLクリップボードメタデータを解析し、ベストエフォートで記法を展開する。

### 【Phase 6】 公開ドキュメント体系化と価値訴求 (Public Documentation & Adoption)
Phase 5 までで整備した製品機能を、一般ユーザー・導入担当者・評価者へ伝わる公開ドキュメントとして体系化し、文書化から得た学びを継続的に製品へ還流する。
* **Audience-specific doc set**: 少なくとも `概要`, `クイックスタート/チュートリアル`, `活用シナリオ`, `詳細仕様リファレンス` の 4 系統を公開文書として整備する。
* **Value articulation**: 単なる機能列挙ではなく、「Markdown を中心にしつつ Excel / CSV / XML を正本として扱う意義」「巨大表や印刷要件に強い理由」「どの利用者が何を楽にできるのか」を具体例で説明する。
* **Documentation feedback loop**: 文書化の途中で見つかった曖昧仕様、操作導線の弱さ、検証不足は、`requirements.md` / `02_Architecture` / `03_Implement/test` / `01_Plans/issues` へ逆流させる。文書だけで抱え込まず、要件・設計・テストの正本を更新する。
* **Progressive refinement**: 文書は一度で完成させず、対象読者ごとに価値仮説・つまずき・補足説明を繰り返し見直す。各イテレーションで、どの知見がどの上流文書へ反映されたか追跡可能であること。
* **Documentation quality gate**: 公開文書は、想定読者、前提条件、手順、期待結果、関連正本リンク、既知の制約を必ず明記する。サンプル・スクリーンショット・FAQ・比較表など、理解を補助する素材の追加可否も毎回評価する。

---
**【Initial Action Request (AIへの初期指示)】**
上記仕様の【Phase 1】から実装を開始してください。
まずプロジェクトのディレクトリ構造（関心の分離・キャッシュ機構の配置を明確にすること）を提案し、`markdown-it` カスタムプラグインとキャッシュマネージャーのモックアップコードを出力してください。
