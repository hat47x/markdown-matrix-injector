# ADR-0015: 標準Markdownプレビューから別紙を開くURI

- Status: Accepted
- Date: 2026-09-09
- Scope: issue-0100, issue-0109, ADR-0011の外部オープン経路

## Context
Windows VS Code 1.136.1へVSIXをインストールして確認した結果、ADR-0011の`command:`ボタンは無反応だった。相対リンクはVS Code内のバイナリエディターに到達する。Workspace Trustだけで任意のcommand URIが実行できるという旧前提は成立しない。

## Decision
ファイル名の相対リンクを保持し、外部オープンはVS Codeの拡張URIハンドラーへ渡す。`vscode.env.uriScheme`を使用してStable/Insidersを区別する。URIには元データの絶対パスだけを符号化する。受信側は信頼済みのローカルワークスペース内の既存CSV/TSV/XLS/XLSX/XMLファイルに制限し、realpathで境界を確認して`env.openExternal`へ渡す。任意のコマンド・実行ファイル・外部URLは受け付けない。

## Consequences
標準プレビューのセキュリティ設定を変更せず動作できる。VS Code/OSのリンクを開く確認が表示される場合は利用者が確認する。リモート環境・ブラウザー版でのOS既定アプリ起動は今回の保証範囲外。自動検証は引数・境界・登録とし、最終クリックは実機で確認する。

## Traceability
- requirements.md Phase 4 / Phase 11 G1・G4
- ADR-0010 / ADR-0011
- issue-0100 / issue-0109
