# Issue: VS Code Markdown プレビューへの注入結線 (extendMarkdownIt)

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: src/plugin/markdownMatrixPlugin.ts, src/extension.ts, package.json, test/markdownMatrixPlugin.test.ts
- Expected verification level: unit (host上の最終描画はmanual-e2eへ委譲)

## Traceability
- Related Backlog/Phase: requirements.md Phase 11 (Product Completeness & Release-Worthiness, G1) / Phase 1の中核要件「Markdownプレビュー上に動的インライン表示」を実利用へ接続
- Related ADR/Spec: `01_Plans/adr/ADR-0010-product-completion-gate.md`
- Upstream contract: VS Code markdown-language-features `RenderEnv.currentDocument: vscode.Uri`（描画時に文書URIをenvで受領）

## 背景 (なぜ最優先か)
本ツールのミッションは「Markdownプレビュー上に外部データをスライスして動的インライン表示する」こと（requirements.md §0）。
しかし実装は `markdownMatrixPlugin` を **テスト専用コマンド `renderEmbedForTest` の内部でしか** 使用しておらず、
VS Code Markdownプレビューへの結線（`extendMarkdownIt` のexportと `contributes.markdown.markdownItPlugins`）が存在しなかった。
そのため、利用者が拡張機能をインストールしてプレビューを開いても `![[...]]` は注入されない。
チュートリアル（`04_Documentation/tutorial.md`）が約束する中核挙動が実ユーザーに届かない状態であり、採用以前の最優先欠落である。

## Execution Plan
### Proposed solution (解決策の概要)
1. `markdownMatrixPlugin` を「描画時のenvから文書パスを解決する」よう後方互換で拡張する。
   - markdown-itのcoreルールは `state.env.currentDocument.fsPath`（VS Codeが渡す `vscode.Uri`）からMarkdownファイルパスを取得できる。
   - envに文書情報が無い場合（既存の `renderEmbedForTest` / 単体テスト経路）は従来どおり `options.markdownFilePath` にフォールバックする。
   - プラグインは `vscode` をimportせず、envはduck-typingで参照してテスト可能性を維持する。
2. `extension.ts` に `export function extendMarkdownIt(md): MarkdownIt` を追加し、拡張ライフサイクルで単一の `WorkbookCache` を共有してプレビュー横断のmtimeキャッシュを成立させる。workspaceRootは描画時に `vscode.workspace.getWorkspaceFolder` から解決する。
3. `package.json` の `contributes` に `"markdown.markdownItPlugins": true` を追加する。

### Acceptance criteria (受入条件)
- [x] `markdownMatrixPlugin` が `md.render(src, { currentDocument: { fsPath } })` のenvから文書パスを解決し、`![[...]]` を表として注入する（単体テストで検証）。
- [x] envに文書情報が無い場合は `options.markdownFilePath` にフォールバックし、既存の143テストが全てpassする（後方互換）。
- [x] `extension.ts` が `extendMarkdownIt` をexportし、`package.json` が `markdown.markdownItPlugins` をcontributeする。
- [x] `npm run build`（tsc）と `npm test`（unit + phase9-sync）がpassする。
- [ ] (manual-e2e / delegated) 実VS Code上でプレビューを開くと `![[...]]` がテーブル/カードとして描画される。スタイル適用はissue-0094で扱う。

### Task breakdown (作業分解)
- [x] `markdownMatrixPlugin.ts`: envからの文書パス解決と `EmbedRenderContext` への切り出し。
- [x] `extension.ts`: `extendMarkdownIt` 追加（共有キャッシュ + workspaceRoot解決）。
- [x] `package.json`: `markdown.markdownItPlugins` contribution追加。
- [x] `markdownMatrixPlugin.test.ts`: env経由解決の正常系・文書情報欠如時の非注入を追加。
- [x] `npm run build` / `npm test` で検証。

### Validation plan (検証計画)
- `npm run build` がexit 0。
- `npm test` がexit 0、追加テストを含め全pass。
- env契約はVS Code (`markdown-language-features/src/markdownEngine.ts`) の `RenderEnv` 定義に準拠していることを根拠とする。
- 実プレビュー描画とスタイルはarchitecture文書（`02_Architecture/vscode-extension-host-e2e.md` §3.4）に従いdelegated manual scope / issue-0094へ委譲する。
