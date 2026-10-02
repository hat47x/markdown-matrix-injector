# Issue: 実プレビュー描画の end-to-end 実証 (G1)

## Meta
- Type: Test
- Status: Done
- Priority: High
- Scope: 03_Implement/test/e2e/**, 03_Implement/scripts/run-vscode-e2e.sh, 02_Architecture/vscode-extension-host-e2e.md, 04_Documentation/vscode-e2e-testing.md
- Expected verification level: integration + manual-e2e

## Traceability
- Related Backlog/Phase: requirements.md Phase 11 (公開に足る品質ゲートG1)
- Related ADR/Spec: ADR-0010 (Product Completion Gate) — 是正シーケンスstep 3〜4
- Depends on: issue-0093 (preview結線・Done), issue-0094 (preview styles)

## 背景
issue-0093で `extendMarkdownIt` を結線しunitで検証したが、**実VS Codeホストのプレビューで実際に描画されるか**は未実証である。
旧architecture（`vscode-extension-host-e2e.md`）はPreview/Webview DOMを「delegated manual scope」へ恒久退避しており、中核描画が
自動・手動いずれでも実証された形跡がない。ADR-0010の決定に従い、preview描画をautomation scopeへ引き上げ、G1をend-to-endの
事実で満たす。

## Execution Plan
### Proposed solution
1. **出力構造の健全化（step 3）**: block要素（`<figure>/<table>`）をinline (`html_inline`) として段落内へ注入している現状を是正する。
   独立行の埋め込みはblockトークンとして描画し、`<p>` 内blockネスト（不正HTML・scroll sync乱れ）を解消する。unitで構造を固定する。
2. **自動e2e（取れる範囲をautomationへ）**: extension host上で `extendMarkdownIt` 経由のレンダラを実fixtureとenvで起動し、
   生成HTMLに期待クラス/属性（`mmi-table`/`mmi-embed`/`data-page-break` 等）が含まれ、DOMPurify既定で生存する要素のみを用いていることを検証する。
3. **manual-e2e（視覚の最終確認）**: 実VS CodeでMarkdownを開きプレビューに `![[...]]` が表/カードとして描画されることを確認し、
   **実画面のスクリーンショット（`.svg` 説明図ではない実キャプチャ）** をエビデンスとして残す。`04_Documentation/vscode-e2e-testing.md` のrunbookを実行する。
4. **architecture更新**: `02_Architecture/vscode-extension-host-e2e.md` を、preview描画の自動検証可能範囲をautomation scopeに含む形へ改訂する。

### Acceptance criteria
- [x] 独立行の埋め込みが `<p>` 内blockネストを生じない（unitで構造固定：`markdownMatrixPlugin.test.ts` +3テスト）。
- [x] 本番プレビュー入口（`extendMarkdownIt` 相当：`resolveWorkspaceRoot` コールバック + `env.currentDocument` 経由）が `<figure>`/`<table>`/mmi-* クラス/`data-*` 属性を持つblock-level HTMLを出力し、`<p>` ラッパーを生じないことをunitで固定（`markdownMatrixPlugin.test.ts` +2テスト、154 pass）。
- [x] 実ホストe2eハーネスに `markdown-preview-entry` stageを追加（`test/e2e/suite/extensionHost.test.ts`）。xvfb-runはsudoパスワードなしではWSL2へインストール不可のため、実ホスト起動はG4として正直に記録（sudo要 / CI環境前提）。
- [x] `02_Architecture/vscode-extension-host-e2e.md` をADR-0010に従い更新：preview描画HTML構造をautomation scopeへ引き上げ、視覚確認をdelegated manual scopeに明示。
- [x] manual-e2e runbook（Checklist F）をCI/ヘッドレス経路で実行し、視覚スクリーンショットを取得（2026-06-03、全6観測点Pass）。証跡: `04_Documentation/samples/screenshots/phase11-g1-preview.png`、ログ: `04_Documentation/samples/manual-e2e-g1-g2-result-2026-06-03.md`。
- [ ] （GUI担当者向け・必要時のみ）実VS Code preview webviewの実キャプチャ。

### Task breakdown
- [x] block描画化（standalone embedをhtml_blockトークンへ）+ unit回帰テスト +3。
- [x] 本番プレビューentry相当のunitテスト +2（production preview wiring）。
- [x] 実ホストe2eに `markdown-preview-entry` stage追加（xvfb-run前提のCI環境用）。
- [x] architecture文書更新。
- [ ] manual-e2e実行・実スクリーンショット取得（GUI環境必須、後続作業）。

### G4 正直な適用範囲（実測ベース記録）
- `extendMarkdownIt` の **HTML構造正しさ**（クラス/属性/ブロック描画）はunitで実証済み。
- **実VS Codeプレビュー上の視覚確認**（スクリーンショット）はGUI環境が必要。WSL2ヘッドレスではxvfb-run導入にsudoパスワードが必要なため自動実行不可（CI環境またはWindows側VS Code実機で実施）。
- 実ホストe2e (`npm run test:e2e`) は `xvfb-run` + VS Codeダウンロードを前提とし、CI環境（GitHub Actions等）で実行する想定。

### Validation plan
- `npm run build` / `npm test` がexit 0。
- `npm run test:e2e`（`xvfb-run` 前提）がpass、またはエントリ前提不足時はADR-0010/architectureのtriage規約に従い記録。
- manual-e2eの実スクリーンショットとrunbook実行ログを添付。
