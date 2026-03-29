# Issue: Phase 6 Scenario Product Gap Follow-up（Scenario ROI運用で発見した機能ギャップの追跡）

## Meta
- Type: Feature
- Status: In Progress
- Priority: Medium
- Scope: `03_Implement/`（スニペット補助・監査エビデンス出力の実装検討）, `04_Documentation/scenario-sier-design-docs.md`（要求根拠）
- Expected verification level: docs-check

## Traceability
- Related Backlog/Phase: Phase 6: 公開ドキュメント体系化と価値訴求 (Public Documentation & Adoption)
- Related ADR/Spec: `01_Plans/adr/ADR-0003-phase6-user-value-maximization-roadmap.md`, `02_Architecture/phase6-public-documentation-architecture.md`, `01_Plans/issues/issue-0017-phase6-scenario-roi-proof.md`

## Execution Plan
### Proposed solution (解決策の概要)
- Scenario ROI文書で抽出された product gap を feature backlog として独立管理し、導入可否判断で要求された再現性（手順テンプレート）と証跡性（抽出クエリ履歴）を実装計画へ接続する。

### Acceptance criteria (受入条件)
- [ ] Scenario本文で抽出された2件の product gap を、実装対象・期待価値・非対象範囲つきで明文化する。
- [ ] 各 gap について、最小実装案（MVP）と延期条件（なぜ今すぐ実装しないか）を定義する。
- [ ] 実装着手可否を判断するための検証コマンド（docs-check / unit / manual-e2e）を列挙する。
- [ ] issue-0017 から本issueへの追跡導線が成立していることを確認する。

### Task breakdown (作業分解)
- [ ] ギャップ1「観点別テンプレート自動挿入（スニペット）」の要件を整理する。
- [ ] ギャップ2「抽出クエリ履歴のエビデンス出力」の要件を整理する。
- [x] 既存実装への影響範囲を `03_Implement/src` で調査し、変更候補を列挙する。
- [ ] 実装前提の検証観点（互換性・運用コスト・UI/UX）を定義する。

### Validation plan (検証計画)
- `rg -n "ギャップ候補|スニペット|抽出クエリ履歴|エビデンス出力" 04_Documentation/scenario-sier-design-docs.md 01_Plans/issues/issue-0017-phase6-scenario-roi-proof.md 01_Plans/issues/issue-0021-phase6-scenario-product-gap-followup.md`
- `python3 01_Plans/tools/planning_queue.py`

## Impact analysis (2026-03-29 UTC)
### ギャップ1: 観点別テンプレート自動挿入（スニペット）
- 変更候補:
  - `03_Implement/src/dx/autocompleteProvider.ts`: `query-param` 候補と同様に、観点別テンプレート展開候補（手順/期待結果/制約）を提供する補助APIを追加。
  - `03_Implement/src/extension.ts`: コマンド登録（例: `markdownMatrixInjector.insertScenarioObservationTemplate`）と、カーソル位置への挿入処理を追加。
  - `03_Implement/test/autocompleteProvider.test.ts`: テンプレート候補の提示条件（文脈・重複防止）を検証。
- 非対象（本Issueの初期MVPでは扱わない）:
  - 既存 Markdown プレビュー描画ロジック（`src/plugin`, `src/core`）の変更。

### ギャップ2: 抽出クエリ履歴のエビデンス出力
- 変更候補:
  - `03_Implement/src/parser/embedSyntax.ts`: 埋め込みクエリの抽出結果を再利用しやすい形で保持。
  - `03_Implement/src/dx/vscodeAdapters.ts`: 診断更新フローと同じ文書走査を利用し、クエリ履歴の収集関数を追加。
  - `03_Implement/src/extension.ts`: コマンド登録（例: `markdownMatrixInjector.exportQueryEvidence`）で CSV/JSON を出力。
  - `03_Implement/test/diagnostics.test.ts` もしくは新規 test: 履歴抽出の再現性（同一文書で安定した順序）を検証。
- 非対象（本Issueの初期MVPでは扱わない）:
  - 外部監査システム連携（API送信、クラウド保存）。
