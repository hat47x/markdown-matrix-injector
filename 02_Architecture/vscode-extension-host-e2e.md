# VSCode Extension Host E2E Test Architecture

## 1. Goal
- Docker / CI の headless 環境でも、実際の VSCode エンジン (Extension Host) を起動して MMI のレンダリングを検証する。
- 画面クリックではなく、自動テストスクリプトから VSCode API・拡張コマンド・生成 HTML を検証対象にする。

## 2. Requirements整理
1. **実エンジン起動**: `@vscode/test-electron` で VSCode をダウンロードし、開発中の拡張を Extension Host 上で起動する。
2. **Headless対応**: Docker では `xvfb-run` を介して Electron が要求するディスプレイを仮想化する。
3. **MMI検証対象**: Markdown 埋め込み結果の HTML 断面を API/コマンド経由で取得し、テーブル表示・カード縮退・メタデータ付与を検証する。
4. **将来拡張**: Webview / Markdown Preview の iframe DOM を Playwright で検証できる構造にしておく。

## 3. Test strategy
### 3.1 現段階の自動化スコープ
- 最小 VSCode 拡張エントリーポイント `src/extension.ts` を追加し、テスト専用コマンド `markdownMatrixInjector.renderEmbedForTest` を公開する。
- コマンドは既存の `markdown-it` プラグインを使って Markdown を HTML に変換し、その結果文字列を返す。
- Extension Host テストでは、VSCode 上で当該コマンドを `vscode.commands.executeCommand` から呼び出し、戻り値の HTML を検証する。

### 3.2 Docker / CI 実行方式
- `scripts/run-vscode-e2e.sh` が `xvfb-run` の有無を確認し、存在すれば `@vscode/test-electron` ベースのテストランナーを起動する。
- `xvfb-run` が未導入の環境では即時失敗して、必要な OS パッケージ導入を案内する。

### 3.3 将来の Playwright 連携ポイント
- Markdown Preview / Webview DOM 検証が必要になったら、同じ Extension Host 起動手順の上でプレビューを開くコマンドを追加する。
- Playwright は VSCode ウィンドウ内の iframe / webview DOM を対象に、`table`, `tr`, `figcaption`, `mmi-card` の存在や CSS クラスを検証する。
- 現時点では DOM 実装が未整備なため、HTML 断面の取得までを first milestone とし、Playwright は phase 2 として設計に留める。

## 4. Directory mapping
- `03_Implement/src/extension.ts`: Extension Host の最小拡張エントリーポイント
- `03_Implement/test/e2e/`: `@vscode/test-electron` ランナーと Extension Host integration suite
- `03_Implement/test/fixtures/workspace/`: E2E 用の Markdown / CSV fixture
- `03_Implement/scripts/run-vscode-e2e.sh`: Xvfb 前提の headless 実行スクリプト

## 5. Verification matrix
| Layer | Tool | Assert |
|---|---|---|
| Unit | `node --test` | パーサ、ローダー、レンダラー単体仕様 |
| Integration | `@vscode/test-electron` | 実際の VSCode Engine 上でのコマンド実行と HTML 出力 |
| Future E2E | Playwright + VSCode Preview | Webview / Markdown Preview の DOM と表示崩れ |
