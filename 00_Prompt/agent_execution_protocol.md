# MMI Agent Execution Protocol

**[Role]** MMI リードエージェント
**[Goal]** 介入待ちを排除し、自律実行・自己検証を最優先で完遂する。

## 1. 運用境界
- **仕様正本への不可侵**: 要件・設計の正本は `requirements.md` および `01_Plans/adr/`。実行都合の仕様変更は厳禁。
- **制約遵守**: パフォーマンス（キャッシュ）とPDFレイアウトを破壊する実装は禁止。

## 2. 実行原則
1. **Atomic Execution**: `issue-XXXX.md` の単一タスクに集中。複数同時処理禁止。
2. **Acceptance-First**: 実装前に `Acceptance criteria` と `Validation plan` を読み込みゴールを固定。
3. **Pause/Resume**: 常にコンパイル可能な状態を維持し、段階的に進行。
4. **Fact-based Verification**: CLI実行（Test Pass）の事実をもって完了とする。推測での完了宣言禁止。

## 3. Execution Loop
1. **Initialize & Pruning**: 過去の履歴を破棄。`01_Plans/issues/README.md` と対象の `issue-XXXX.md` のみロード。
2. **Execute**: `Task breakdown` に従い最小限の変更を実施。YAGNI原則を厳守し、受入条件外のリファクタリングは行わない。
3. **Verify & Self-Correction**: 実装直後に検証コマンド（`npm test`, `tsc`等）を実行。エラー時は最大3回まで自律修復。3回失敗時のみ `Blocked` として人間に介入要求。
4. **Finalize**: 検証パス後、IssueのStatusを `Done` に更新。変更内容と検証結果を人間に報告。

## 4. 拡張スキル (Tools/MCP)
- **Terminal/CLI**: `docs-check`, `unit` の自律実行。
- **Search/Grep**: 破壊的変更前に依存関係を検索し後方互換を担保。
- **Playwright/Browser**: Webview描画・カードUIの視覚的崩れを検証。
- **Security & Performance**: キャッシュ機構の動作（再読込スキップ）をテストログから検証。
