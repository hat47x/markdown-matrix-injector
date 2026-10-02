# ADR-0011: カード「開く」操作の webview 実現方式 (Card Open Affordance)

> 2026-09-09更新: 外部アプリを開くリンク方式は [ADR-0015](ADR-0015-preview-open-uri.md) に置き換えました。以下は旧command方式を選択した時点の判断記録です。

- Status: Accepted
- Date: 2026-06-10
- Deciders: MMI Lead Agent
- Consulted: Architecture Lead, Product/UX Lead, QA/Delivery Lead
- Informed: Documentation / Implementation maintainers
- Scope: Smart Fallbackカードから元ファイルを開く操作の実現方式、webviewセキュリティ前提、検証境界

## Context (背景と課題)
- 要件Phase 4はカードUIに「ファイル名・範囲・開くボタン（クリックで `env.openExternal`）」を求める。現状 `renderCard.ts` は
  `mmi-card__title` と `mmi-card__meta` のみで、開く操作も `openExternal` 連携も未実装（issue-0100）。
- VS Code Markdownプレビューはsandboxed webviewであり、以下の制約がある（一次確認: VS Code docs / microsoft/vscode#203410）。
  - プレビューのセキュリティは既定 Strict（スクリプト無効、信頼コンテンツのみ）。
  - `command:` URIリンクは信頼コンテンツ（Workspace Trust等）でのみ発火する。
  - 非mdローカルファイルへのリンククリック挙動はバージョン依存で不安定な既知課題がある。
- したがって「クリックでOS既定アプリ（Excel等）を開く」最終挙動は、信頼状態・preview security・VS Codeバージョンに依存し、
  ヘッドレスでは検証できない。方式決定は不可逆な設計事項のためADR化する。

## Decision (決定事項)
カードの「開く」操作を、堅牢性（常に何らか開ける）と仕様忠実性（env.openExternalでOSアプリ）を両立するハイブリッド方式とする。

1. **ベースライン（常時動作・Strict可・trust不要）**: カード見出し（ファイル名）を元ファイルへの相対パスリンクとして描画する
   （`<a class="mmi-card__title" href="<相対パス>">`）。標準リンクのためsanitizer安全で、Strictモードでもプレビューのリンク
   ハンドラ経由で元ファイルへ到達できる。
2. **仕様忠実な拡張（信頼環境）**: 明示的な「外部で開く」ボタンを `command:` URIで描画する
   （`<a class="mmi-card__open" href="command:markdownMatrixInjector.openSource?<encoded>">`）。`openSource` コマンドは
   `vscode.env.openExternal(vscode.Uri.file(absolutePath))` を呼び、OS既定アプリで開く（要件Phase 4のenv.openExternalに忠実）。
3. **コマンド登録**: `markdownMatrixInjector.openSource` を通常ユーザコマンドとして登録する（test-gateしない）。引数は
   絶対パス1つ。`env.openExternal` 失敗時はエラー通知。
4. **セキュリティ前提の明文化（G4）**: `command:` ボタンはWorkspace Trust / preview securityに依存し、未信頼環境では発火しない。
   その場合もベースラインのパスリンクで元ファイルへ到達できる（graceful degradation）。最終クリック挙動はGUI manual-e2eで確認する。
5. **検証境界**: HTML構造（リンク・command URIエンコード・解決パス）と コマンド登録はunit/自動で固定する。実webviewの
   クリック発火（OSアプリ起動）はdelegated manual scope（GUI必須）とする。ADR-0010の「動くことを実証してからリリース」に従い、
   ヘッドレスで盲目実装せず、自動検証可能な範囲を先に固める。

## Consequences (結果と影響)
- **Good:** 未信頼環境でも「カードから元ファイルへ到達」が必ず成立し（パスリンク）、信頼環境では仕様どおり OS アプリで開ける。
- **Good:** 方式が sanitizer 安全な標準リンク中心のため、preview の HTML 生存リスクが低い。
- **Good:** HTML 構造とコマンド登録は自動検証でき、退行を防げる。
- **Bad:** `command:` ボタンの最終挙動は trust/version 依存で、ヘッドレス自動検証では保証できない（GUI manual-e2e 必須）。
- **Trade-off 受容理由:** 「OS アプリで開く」を单一方式で強制するより、常時動作のベースライン＋信頼環境での忠実拡張の二段構えが、
  実利用環境の多様性に対して壊れにくい。

## Traceability (関連情報)
- Related requirements: `00_Prompt/requirements.md` Phase 4（リンクカードUI / env.openExternal）
- Related issue: `issue-0100-phase11-card-open-button.md`
- Related ADR: `ADR-0010-product-completion-gate.md`（G1/G4と検証境界の原則）
- Implementation: `03_Implement/src/core/renderCard.ts`, `03_Implement/src/extension.ts`, `03_Implement/media/markdown-matrix.css`
- Evidence (upstream): VS Code Markdown preview security (Strict既定), command URIはtrustedのみ, microsoft/vscode#203410（リンク挙動のversion依存）

## 議事録 (AI読込不要)
### Issue Definition
- sandboxed previewで「クリックして元ファイル（Excel）を開く」をどう実現するか。command URIはtrust依存、plain linkは挙動がversion依存。

### Virtual Debate
- Product/UX Lead: 利用者の意図は「元データへ到達」。最低限どの環境でも到達できることが先決。OSアプリ起動は理想だがtrust依存なら必須要件にしない。
- Architecture Lead: command URI単一方式は未信頼環境で無反応になり「壊れている」印象を与える。標準リンクをベースラインにし、command URIは拡張として上積みする二段構えが堅牢。sanitizer安全性も標準リンクが有利。
- QA/Delivery Lead: 最終クリック挙動はヘッドレスで検証不能。自動ではHTML構造とコマンド登録までを保証境界にし、OSアプリ起動はGUI manual-e2eに委譲する。ADR-0010の原則と整合。

### Synthesis & Decision
- 3ロール合意: ハイブリッド方式（ベースライン相対パスリンク + command URI外部オープン）。自動検証はHTML構造/コマンド登録まで、OS挙動はGUI manual-e2e。
- requirementsのコア（env.openExternal）を破壊せず、未信頼環境向けにgraceful degradationを足す補完であり、ADR + 実装で実行可能（人間承認待ち不要）。外部アプリ起動という副作用はenv.openExternalの仕様内であり新規コスト/外部APIではない。
