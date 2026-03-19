# VSCode Extension Host E2E Test Architecture

## 1. Goal
- Docker / CI の headless 環境でも、実際の VSCode エンジン (Extension Host) を起動して MMI の Phase 5 統合を検証する。
- 画面クリックではなく、自動テストスクリプトから VSCode API・拡張コマンド・Diagnostics を検証対象にする。

## 2. Requirements整理
1. **実エンジン起動**: `@vscode/test-electron` で VSCode をダウンロードし、開発中の拡張を Extension Host 上で起動する。
2. **Headless対応**: Docker では `xvfb-run` を介して Electron が要求するディスプレイを仮想化する。
3. **MMI検証対象**: Markdown 埋め込み結果の HTML 断面、補完候補、Diagnostics、Paste / D&D 入口コマンドを検証する。
4. **責務分離**: DX ロジック本体 (`src/dx/*`)・VSCode 統合層 (`src/extension.ts`)・E2E 検証レイヤ (`test/e2e/**`) の責務を混同しない。
5. **将来拡張**: Webview / Markdown Preview の iframe DOM を Playwright で検証できる構造にしておく。

## 3. Test strategy
### 3.1 現段階の自動化スコープ
- Extension Host テストは `vscode.commands.executeCommand`, `vscode.executeCompletionItemProvider`, `vscode.languages.getDiagnostics` を利用し、Stream A が公開した最小の VSCode surface を検証する。
- `renderEmbedForTest` は既存レンダリングの回帰確認に使う。
- Paste / D&D は native provider (`registerDocumentPasteEditProvider` / `registerDocumentDropEditProvider`) を正規入口とし、E2E では DataTransfer adapter と command fallback の両方を検証する。

### 3.2 責務分離
- **DXロジック本体**: `03_Implement/src/dx/autocompleteProvider.ts`, `diagnostics.ts`, `pasteDrop.ts`
  - 候補生成、診断判定、clipboard/filepath 解析の仕様正本。
- **VSCode統合層**: `03_Implement/src/extension.ts`
  - Completion Provider 登録、Diagnostics collection 反映、native paste/drop provider 登録、非対応 host 向け command fallback の公開。
- **E2E検証レイヤ**: `03_Implement/test/e2e/**`
  - 実エンジン上で公開 API を呼び、Phase 5 の統合結果だけを検証する。

### 3.3 Docker / CI 実行方式
- `scripts/run-vscode-e2e.sh` が `xvfb-run` の有無を確認し、存在すれば `@vscode/test-electron` ベースのテストランナーを起動する。
- `test/e2e/runTest.ts` が fixture workspace を一時ディレクトリへ複製し、Diagnostics 用の補助ファイルを追加してから VSCode を起動する。
- `xvfb-run` 未導入、Electron 依存ライブラリ不足、VSCode ダウンロード不能といった環境要因はテスト不能理由として切り分ける。

### 3.4 将来の Playwright 連携ポイント
- Markdown Preview / Webview DOM 検証が必要になったら、同じ Extension Host 起動手順の上でプレビューを開くコマンドを追加する。
- Playwright は VSCode ウィンドウ内の iframe / webview DOM を対象に、`table`, `tr`, `figcaption`, `mmi-card` の存在や CSS クラスを検証する。
- 現時点では DOM 実装が未整備なため、Extension Host API レベルの確認までを first milestone とする。

## 4. Directory mapping
- `03_Implement/src/extension.ts`: VSCode 統合層の公開 surface
- `03_Implement/test/e2e/`: `@vscode/test-electron` ランナーと Extension Host integration suite
- `03_Implement/test/fixtures/workspace/`: E2E 用の base workspace fixture
- `03_Implement/scripts/run-vscode-e2e.sh`: Xvfb 前提の headless 実行スクリプト
- `04_Documentation/vscode-e2e-testing.md`: 実行手順・失敗時の見方

## 5. Verification matrix
| Layer | Tool | Assert |
|---|---|---|
| Unit | `node --test` | パーサ、ローダー、DX ロジック単体仕様 |
| Integration | `@vscode/test-electron` | 実際の VSCode Engine 上での render / completion / diagnostics / paste-drop command |
| Future E2E | Playwright + VSCode Preview | Webview / Markdown Preview の DOM と表示崩れ |
