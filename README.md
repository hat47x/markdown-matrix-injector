# Markdown Matrix Injector (MMI)

**Markdownの「執筆性の高さ」とExcelの「構造化データの管理能力」を、疎結合のまま統合する。**

**Markdown Matrix Injector (MMI)** は、SIerのドキュメント作成プロセスを改革するためのVSCode拡張機能です。
外部のデータソース（Excel, CSV, XML）を「Single Source of Truth（正本）」として扱い、Markdownプレビュー上に必要な文脈だけをクエリによってスライスし、動的にインライン表示（注入）します。

Word文書を超えるエンタープライズ品質の設計書を、Markdownベースで構築・保守するための「ドキュメント構築のクエリエンジン」です。

---

## ドキュメント導線（人間向け / AI向け）

この README は **人間向けの入口** です。開発に参加するAIエージェント、およびプロジェクトの仕様・意思決定の詳細を確認したい場合は次を参照してください。

- **AIエージェント向けの入口**: [`AGENTS.md`](AGENTS.md)
  - 生成AIを用いて開発を進めるためのゴールデンルールとProject Mapです。
- **プロジェクト憲法とプロトコル**: `00_Prompt/` 配下
  - AIが自律的かつ安全に駆動するための `system_prompt.md` や実行プロトコルが格納されています。
- **要件定義と仕様の正本**: [`00_Prompt/requirements.md`](00_Prompt/requirements.md)
  - 本ツールの設計思想、クエリ仕様、PDFレイアウト制御などの機能要件です。
- **計画と意思決定のハブ**: [`01_Plans/README.md`](01_Plans/README.md)
  - アーキテクチャの決定事項（ADR）と、日々の実装タスク（Issue Memo）のインデックスです。

---

## 主な特徴（提供価値）

1. **ドキュメントのクエリエンジン**: 独自記法 `![[ファイル#シート|範囲?パラメータ]]` による柔軟なデータ抽出。
2. **Smart Fallback**: 巨大表のPDFレイアウト破綻を防ぐ「リンクカードUI」への自動縮退。
3. **脱Word・エンタープライズ印刷制御**: キャプション付与、PDFの改ページやLandscape（横向き）指定のサポート。
4. **インテリジェンスな開発者体験 (DX)**: 強力なオートコンプリートと、リンク切れを防ぐ静的解析（Diagnostics）。

---

## 開発の始め方

1. リポジトリをクローンし、`npm install` を実行します。
2. 実装コード、テスト、ビルド設定は [`03_Implement/`](03_Implement/README.md) 配下にあります。
3. 新規開発・修正を行う場合は、まず `01_Plans/issues/TEMPLATE.md` を用いてタスクの Issue Memo を起票してください。
4. AIエージェント（Codex等）を使用する場合は、必ず作業前に [`AGENTS.md`](AGENTS.md) を一読させてください。
