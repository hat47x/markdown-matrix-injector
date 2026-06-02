# Issue: 実プレビュー描画の end-to-end 実証 (G1)

## Meta
- Type: Test
- Status: In Progress
- Priority: High
- Scope: 03_Implement/test/e2e/**, 03_Implement/scripts/run-vscode-e2e.sh, 02_Architecture/vscode-extension-host-e2e.md, 04_Documentation/vscode-e2e-testing.md
- Expected verification level: integration + manual-e2e

## Traceability
- Related Backlog/Phase: requirements.md Phase 11 (公開に足る品質ゲート G1)
- Related ADR/Spec: ADR-0010 (Product Completion Gate) — 是正シーケンス step 3〜4
- Depends on: issue-0093 (preview 結線・Done), issue-0094 (preview styles)

## 背景
issue-0093 で `extendMarkdownIt` を結線し unit で検証したが、**実 VS Code ホストのプレビューで実際に描画されるか**は未実証である。
旧 architecture（`vscode-extension-host-e2e.md`）は Preview/Webview DOM を「delegated manual scope」へ恒久退避しており、中核描画が
自動・手動いずれでも実証された形跡がない。ADR-0010 の決定に従い、preview 描画を automation scope へ引き上げ、G1 を end-to-end の
事実で満たす。

## Execution Plan
### Proposed solution
1. **出力構造の健全化（step 3）**: block 要素（`<figure>/<table>`）を inline (`html_inline`) として段落内へ注入している現状を是正する。
   独立行の埋め込みは block トークンとして描画し、`<p>` 内 block ネスト（不正 HTML・scroll sync 乱れ）を解消する。unit で構造を固定する。
2. **自動 e2e（取れる範囲を automation へ）**: extension host 上で `extendMarkdownIt` 経由のレンダラを実 fixture と env で起動し、
   生成 HTML に期待クラス/属性（`mmi-table`/`mmi-embed`/`data-page-break` 等）が含まれ、DOMPurify 既定で生存する要素のみを用いていることを検証する。
3. **manual-e2e（視覚の最終確認）**: 実 VS Code で Markdown を開きプレビューに `![[...]]` が表/カードとして描画されることを確認し、
   **実画面のスクリーンショット（`.svg` 説明図ではない実キャプチャ）** をエビデンスとして残す。`04_Documentation/vscode-e2e-testing.md` の runbook を実行する。
4. **architecture 更新**: `02_Architecture/vscode-extension-host-e2e.md` を、preview 描画の自動検証可能範囲を automation scope に含む形へ改訂する。

### Acceptance criteria
- [x] 独立行の埋め込みが `<p>` 内 block ネストを生じない（unit で構造固定：`markdownMatrixPlugin.test.ts` +3 テスト）。
- [x] 本番プレビュー入口（`extendMarkdownIt` 相当：`resolveWorkspaceRoot` コールバック + `env.currentDocument` 経由）が `<figure>`/`<table>`/mmi-* クラス/`data-*` 属性を持つ block-level HTML を出力し、`<p>` ラッパーを生じないことを unit で固定（`markdownMatrixPlugin.test.ts` +2 テスト、154 pass）。
- [x] 実ホスト e2e ハーネスに `markdown-preview-entry` stage を追加（`test/e2e/suite/extensionHost.test.ts`）。xvfb-run は sudo パスワードなしでは WSL2 へインストール不可のため、実ホスト起動は G4 として正直に記録（sudo 要 / CI 環境前提）。
- [x] `02_Architecture/vscode-extension-host-e2e.md` を ADR-0010 に従い更新：preview 描画 HTML 構造を automation scope へ引き上げ、視覚確認を delegated manual scope に明示。
- [ ] manual-e2e runbook を実行し、実プレビューの実スクリーンショットをエビデンスとして保存（requires 実 VS Code GUI）。

### Task breakdown
- [x] block 描画化（standalone embed を html_block トークンへ）+ unit 回帰テスト +3。
- [x] 本番プレビュー entry 相当の unit テスト +2（production preview wiring）。
- [x] 実ホスト e2e に `markdown-preview-entry` stage 追加（xvfb-run 前提の CI 環境用）。
- [x] architecture 文書更新。
- [ ] manual-e2e 実行・実スクリーンショット取得（GUI 環境必須、後続作業）。

### G4 正直な適用範囲（実測ベース記録）
- `extendMarkdownIt` の **HTML 構造正しさ**（クラス/属性/ブロック描画）は unit で実証済み。
- **実 VS Code プレビュー上の視覚確認**（スクリーンショット）は GUI 環境が必要。WSL2 ヘッドレスでは xvfb-run 導入に sudo パスワードが必要なため自動実行不可（CI 環境または Windows 側 VS Code 実機で実施）。
- 実ホスト e2e (`npm run test:e2e`) は `xvfb-run` + VS Code ダウンロードを前提とし、CI 環境（GitHub Actions 等）で実行する想定。

### Validation plan
- `npm run build` / `npm test` が exit 0。
- `npm run test:e2e`（`xvfb-run` 前提）が pass、またはエントリ前提不足時は ADR-0010/architecture の triage 規約に従い記録。
- manual-e2e の実スクリーンショットと runbook 実行ログを添付。
