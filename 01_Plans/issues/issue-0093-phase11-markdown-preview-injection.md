# Issue: VS Code Markdown プレビューへの注入結線 (extendMarkdownIt)

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: src/plugin/markdownMatrixPlugin.ts, src/extension.ts, package.json, test/markdownMatrixPlugin.test.ts
- Expected verification level: unit (host 上の最終描画は manual-e2e へ委譲)

## Traceability
- Related Backlog/Phase: requirements.md Phase 11 (Product Completeness & Release-Worthiness, G1) / Phase 1 の中核要件「Markdown プレビュー上に動的インライン表示」を実利用へ接続
- Related ADR/Spec: `01_Plans/adr/ADR-0010-product-completion-gate.md`
- Upstream contract: VS Code markdown-language-features `RenderEnv.currentDocument: vscode.Uri`（描画時に文書 URI を env で受領）

## 背景 (なぜ最優先か)
本ツールのミッションは「Markdown プレビュー上に外部データをスライスして動的インライン表示する」こと（requirements.md §0）。
しかし実装は `markdownMatrixPlugin` を **テスト専用コマンド `renderEmbedForTest` の内部でしか** 使用しておらず、
VS Code Markdown プレビューへの結線（`extendMarkdownIt` の export と `contributes.markdown.markdownItPlugins`）が存在しなかった。
そのため、利用者が拡張機能をインストールしてプレビューを開いても `![[...]]` は注入されない。
チュートリアル（`04_Documentation/tutorial.md`）が約束する中核挙動が実ユーザーに届かない状態であり、採用以前の最優先欠落である。

## Execution Plan
### Proposed solution (解決策の概要)
1. `markdownMatrixPlugin` を「描画時の env から文書パスを解決する」よう後方互換で拡張する。
   - markdown-it の core ルールは `state.env.currentDocument.fsPath`（VS Code が渡す `vscode.Uri`）から Markdown ファイルパスを取得できる。
   - env に文書情報が無い場合（既存の `renderEmbedForTest` / 単体テスト経路）は従来どおり `options.markdownFilePath` にフォールバックする。
   - プラグインは `vscode` を import せず、env は duck-typing で参照してテスト可能性を維持する。
2. `extension.ts` に `export function extendMarkdownIt(md): MarkdownIt` を追加し、拡張ライフサイクルで単一の `WorkbookCache` を共有してプレビュー横断の mtime キャッシュを成立させる。workspaceRoot は描画時に `vscode.workspace.getWorkspaceFolder` から解決する。
3. `package.json` の `contributes` に `"markdown.markdownItPlugins": true` を追加する。

### Acceptance criteria (受入条件)
- [x] `markdownMatrixPlugin` が `md.render(src, { currentDocument: { fsPath } })` の env から文書パスを解決し、`![[...]]` を表として注入する（単体テストで検証）。
- [x] env に文書情報が無い場合は `options.markdownFilePath` にフォールバックし、既存の 143 テストが全て pass する（後方互換）。
- [x] `extension.ts` が `extendMarkdownIt` を export し、`package.json` が `markdown.markdownItPlugins` を contribute する。
- [x] `npm run build`（tsc）と `npm test`（unit + phase9-sync）が pass する。
- [ ] (manual-e2e / delegated) 実 VS Code 上でプレビューを開くと `![[...]]` がテーブル/カードとして描画される。スタイル適用は issue-0094 で扱う。

### Task breakdown (作業分解)
- [x] `markdownMatrixPlugin.ts`: env からの文書パス解決と `EmbedRenderContext` への切り出し。
- [x] `extension.ts`: `extendMarkdownIt` 追加（共有キャッシュ + workspaceRoot 解決）。
- [x] `package.json`: `markdown.markdownItPlugins` contribution 追加。
- [x] `markdownMatrixPlugin.test.ts`: env 経由解決の正常系・文書情報欠如時の非注入を追加。
- [x] `npm run build` / `npm test` で検証。

### Validation plan (検証計画)
- `npm run build` が exit 0。
- `npm test` が exit 0、追加テストを含め全 pass。
- env 契約は VS Code (`markdown-language-features/src/markdownEngine.ts`) の `RenderEnv` 定義に準拠していることを根拠とする。
- 実プレビュー描画とスタイルは architecture 文書（`02_Architecture/vscode-extension-host-e2e.md` §3.4）に従い delegated manual scope / issue-0094 へ委譲する。
