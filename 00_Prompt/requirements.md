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
* **Phase 7: リリース運用品質と採用拡大 (Release Readiness & Adoption Scale)**
    * 対象: リリースゲート自動化、query-evidence を使った採用KPI観測、docs audit から上流還流までのSLA運用。
* **Phase 8: 運用信頼性とサポート性強化 (Operational Reliability & Supportability)**
    * 対象: triage自動化、support runbook整備、障害パターンのcontract test化による回帰予防。
* **Phase 9: ルールテーブル相互運用と設計資産化 (Rule Table Interoperability & Design Assetization)**
    * 対象: Drools参照パターンの実データテンプレート化、相互運用検証、設計文書・テスト資産の双方向同期運用。
* **Phase 10: 採用運用ガバナンス自動化 (Adoption Operations Governance Automation)**
    * 対象: query-evidence の継続収集自動化、docs/support 改善SLAの可視化、運用KPIの週次レポート化。

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

### 【Phase 7】 リリース運用品質と採用拡大 (Release Readiness & Adoption Scale)
Phase 1〜6 の成果を継続運用可能な形へ昇華し、公開後の品質と採用拡大を両立させる。
* **Release gate automation**: `docs-check` / `unit` / `integration` の合格条件を release 判定フローとして標準化し、Issueの Validation evidence へ追跡可能に記録する。
* **Adoption observability**: query-evidence artifact を活用し、導入時間・リンク不整合検知率・印刷再現性の KPI を定点観測する。
* **Feedback loop SLA**: docs audit で発見した課題を `requirements` / `02_Architecture` / `03_Implement/test` / `01_Plans/issues` へ還流する期限と責任分界を定義する。
* **Safe evolution rule**: 不可逆な方針変更は ADR、実行改善は issue で管理し、機能追加は release gate を満たす範囲で実施する。

### 【Phase 8】 運用信頼性とサポート性強化 (Operational Reliability & Supportability)
Phase 7 で整備した release gate を「障害時に早く直せる運用基盤」へ発展させ、採用拡大後のサポート品質を安定化する。
* **Failure triage automation**: query-evidence / release-gate artifact から失敗分類（path, sheet, query, render, print）を自動要約し、一次切り分け時間を短縮する。
* **Support playbook hardening**: FAQ・troubleshooting・検証コマンドを runbook として接続し、再現手順（入力・期待値・実際値）を標準化する。
* **Regression prevention by contract tests**: 運用で多発する失敗シナリオを contract test に固定し、release gate で常時検知する。
* **Persona-aware prioritization**: gate fail 時に影響読者（author/reviewer/delivery）を付与し、優先度判断を運用ルール化する。
* **Documentation usability & coverage uplift**: 運用ドキュメントは「検索しやすさ（導線・索引）」「再現に必要な情報の網羅性（前提・入力・期待値・制約）」を品質指標として継続監査し、問い合わせ時の自己解決率を高める。
* **Product quality feedback loop from support logs**: runbook運用・FAQ更新・問い合わせ分類で得た知見を `requirements` / `02_Architecture` / `03_Implement/test` へ定期還流し、文書改善をプロダクト品質改善に直結させる。
* **Reference pattern ingestion from OSS table formats**: Drools の spreadsheet decision table（RuleSet/RuleTable 構造）等を参照し、システム設計文書向けの表パターンと test data パターンを抽出・標準化する。

### 【Phase 9】 ルールテーブル相互運用と設計資産化 (Rule Table Interoperability & Design Assetization)
Phase 8 で定義したパターンを「実運用で再利用できる資産」に昇格させ、設計文書と検証データの同期品質を継続的に担保する。
* **Executable pattern templates**: Drools参照の表パターンを CSV/XLSX テンプレートとして整備し、設計文書でそのまま再利用できるひな形を提供する。
* **Interoperability validation set**: RuleSet相当メタ情報、RuleTable相当条件/アクション、属性列（priority/effective/expires）を含む相互運用テストデータセットを管理する。
* **Round-trip documentation flow**: 文書で使った表テンプレートを test fixture へ同期し、fixtureで見つかった不足を文書テンプレートへ逆反映する双方向運用を標準化する。
* **Template quality gates**: テンプレートは「可読性（読者が意図を理解できる）」「検証性（grep/columns/headerで観測可能）」「追跡性（要件/ADR/issueへ紐付く）」の3軸で監査する。
* **Adoption benchmark pack**: SIer設計文書で頻出する表（要件トレーサビリティ、状態遷移、障害切り分け、リリース判定）を最小ベンチマークセットとして定義し、採用時の初期評価時間を短縮する。
* **Test coverage uplift for template governance**: Phase 9 では sync checker / release gate / query observability の回帰テストを継続拡張し、正常系・異常系・境界値（空欄、重複、日付不正、行差分、I/O失敗）を最低1件以上含むことを必須化する。
* **Test pattern expansion as reusable assets**: テストケースは単発修正に閉じず、再利用可能なパターン（table種別別、query種別別、運用失敗種別別）としてテンプレート化し、次イテレーションで追加しやすい構造へ維持する。

### 【Phase 10】 採用運用ガバナンス自動化 (Adoption Operations Governance Automation)
Phase 9 で整備したテンプレート資産・同期ゲート・観測導線を、継続運用で「改善速度」と「説明責任」を担保できる運用ガバナンスへ昇格させる。
* **Evidence auto-harvest**: `docs-check` / `unit` / `integration` / sync gate の実行結果を query-evidence artifact として定期収集し、失敗分類と影響読者を紐付けて保存する。
* **SLA dashboard seed**: docs audit と support runbook の更新SLA（例: triage 24h, workaround 72h, 恒久対策7日）を機械可読で保持し、期限超過を検知可能にする。
* **Weekly governance report**: 導入時間、リンク不整合検知率、印刷再現性、問い合わせ自己解決率を週次で要約するレポート生成導線を整備する。
* **Backlog auto-escalation rule**: 週次レポート上の閾値逸脱を `01_Plans/issues/` 起票候補として自動抽出し、Decisionが必要な事項のみ `01_Plans/adr/` へエスカレーションする。
* **Auditability baseline**: 運用判断（優先度、延期理由、対応責任者）を追跡可能なメタデータとして残し、将来の採用監査・納品監査に耐える状態を標準化する。

---
**【Initial Action Request (AIへの初期指示)】**
上記仕様の【Phase 1】から実装を開始してください。
まずプロジェクトのディレクトリ構造（関心の分離・キャッシュ機構の配置を明確にすること）を提案し、`markdown-it` カスタムプラグインとキャッシュマネージャーのモックアップコードを出力してください。
