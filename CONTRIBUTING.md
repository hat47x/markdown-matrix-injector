# Contributing to Markdown Matrix Injector (MMI)

MMI へのコントリビューションに関心をお持ちいただきありがとうございます。

## 開発環境

### 前提条件

- **Node.js**: 22 以上
- **npm**: 10 以上
- **Python**: 3.12 以上（リリースゲートツール用）
- **OS**: Linux（WSL2 推奨）/ macOS / Windows

### セットアップ

```bash
git clone https://github.com/hat47x/markdown-matrix-injector.git
cd markdown-matrix-injector/03_Implement
npm ci
npm run build
npm test
```

全テスト（unit + conformance corpus + Phase 9 sync/guide-sync）がパスすれば環境は正常です。

## 開発フロー

### 1. Issue の起票

新規開発・修正を行う前に、Issue Memo を起票してください。

```bash
cp 01_Plans/issues/TEMPLATE.md 01_Plans/issues/issue-XXXX-<slug>.md
```

テンプレートに従って `## Meta`（Type, Priority, Scope）と `## Traceability`（Related ADR/Spec）を記述します。

### 2. ブランチ作成

```bash
git checkout -b feature/issue-XXXX-<short-description>
```

### 3. 実装

- 実装コード: `03_Implement/src/`
- テスト: `03_Implement/test/`
- テスト実行: `npm test`（`03_Implement/` ディレクトリで）
- TypeScript ビルド: `npm run build`

### 4. プルリクエスト

- PR テンプレート（`.github/PULL_REQUEST_TEMPLATE.md`）に従って記述してください。
- CI（build + test + release gate + VSIX packaging）がすべてパスすることを確認してください。
- 関連する ADR / Issue Memo を PR 本文で参照してください。

## 意思決定の分離

MMI プロジェクトでは、**決定（ADR）と実行（Issue）を分離**しています。

- **ADR** (`01_Plans/adr/`): アーキテクチャ上の意思決定。`Draft → Proposed → Accepted/Rejected` のライフサイクル。
- **Issue Memo** (`01_Plans/issues/`): 実行計画。`Draft → Open → In Progress → Done` のライフサイクル。

詳細は [`01_Plans/README.md`](01_Plans/README.md) を参照してください。

## AI エージェントとの協働

このリポジトリは AI エージェント（Claude Code 等）との自律的協働を前提に設計されています。

- AI エージェントで開発する場合は、必ず作業前に [`AGENTS.md`](AGENTS.md) を一読させてください。
- `00_Prompt/` 配下には AI エージェント向けの憲法・実行プロトコルが格納されています。
- Issue Memo のテンプレートとライフサイクルは、人間・AI エージェント共通です。

## テスト

```bash
# 単体テスト
npm test

# E2E テスト（VS Code Extension Host 上での実行）
npm run test:e2e

# リリースゲートツールのテスト
npm run test:release-gate-tools

# 全テスト（unit + Phase 9 sync + Phase 9 guide sync）
npm test
```

### テストカバレッジ

- 単体 + conformance corpus: 226 件（`npm test` の `test:unit` に集約、うち conformance corpus 20 ケース）
- E2E tests: Extension Host 上での描画検証（`npm run test:e2e`、GUI/CI 環境要）

## コミュニティ

- バグ報告・機能リクエストは [GitHub Issues](https://github.com/hat47x/markdown-matrix-injector/issues) へ
- セキュリティ脆弱性の報告は [`SECURITY.md`](SECURITY.md) の手順に従ってください
- 行動規範は [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) を参照してください
