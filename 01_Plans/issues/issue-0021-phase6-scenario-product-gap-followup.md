# Issue: Phase 6 Scenario Product Gap Follow-up（Scenario ROI運用で発見した機能ギャップの追跡）

## Meta
- Type: Feature
- Status: Done
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
- [x] Scenario本文で抽出された2件の product gap を、実装対象・期待価値・非対象範囲つきで明文化する。
- [x] 各 gap について、最小実装案（MVP）と延期条件（なぜ今すぐ実装しないか）を定義する。
- [x] 実装着手可否を判断するための検証コマンド（docs-check / unit / manual-e2e）を列挙する。
- [x] issue-0017 から本issueへの追跡導線が成立していることを確認する。

### Task breakdown (作業分解)
- [x] ギャップ1「観点別テンプレート自動挿入（スニペット）」の要件を整理する。
- [x] ギャップ2「抽出クエリ履歴のエビデンス出力」の要件を整理する。
- [x] 既存実装への影響範囲を `03_Implement/src` で調査し、変更候補を列挙する。
- [x] 実装前提の検証観点（互換性・運用コスト・UI/UX）を定義する。

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
- MVP:
  - `insertScenarioObservationTemplate` コマンドで「前提 / 手順 / 期待結果 / 制約」テンプレートを現在カーソルに挿入。
  - `autocompleteProvider` で `![[` 文脈とは別に、Markdown見出し行でテンプレート候補を提示（重複見出しがある場合は抑止）。
- 期待価値:
  - 観測手順ドキュメントの記述ゆれを減らし、ROI観測の再現性を短時間で確保できる。
- 延期条件（今すぐ実装しない理由）:
  - VS Code操作フローに与える影響が広く、Snippet UX の手戻りを避けるため、まず docs-check + unit で最小導線を固めてから manual-e2e へ進む。

### ギャップ2: 抽出クエリ履歴のエビデンス出力
- 変更候補:
  - `03_Implement/src/parser/embedSyntax.ts`: 埋め込みクエリの抽出結果を再利用しやすい形で保持。
  - `03_Implement/src/dx/vscodeAdapters.ts`: 診断更新フローと同じ文書走査を利用し、クエリ履歴の収集関数を追加。
  - `03_Implement/src/extension.ts`: コマンド登録（例: `markdownMatrixInjector.exportQueryEvidence`）で CSV/JSON を出力。
  - `03_Implement/test/diagnostics.test.ts` もしくは新規 test: 履歴抽出の再現性（同一文書で安定した順序）を検証。
- 非対象（本Issueの初期MVPでは扱わない）:
  - 外部監査システム連携（API送信、クラウド保存）。
- MVP:
  - `exportQueryEvidence` コマンドで、開いている Markdown から `![[...?...]]` を収集し、ローカルに `query-evidence.csv`（必要に応じJSON併記）を出力。
  - 収集順序を文書内出現順で固定し、再実行時に同一入力から同一並びを得る。
- 期待価値:
  - 監査レビューで「どのクエリでどの外部データを参照したか」を即時提示でき、導入可否判断の証跡が残る。
- 延期条件（今すぐ実装しない理由）:
  - 監査システム連携まで含めると認証・送信失敗時の責務分離が必要なため、Phase 6 ではローカル出力までに限定しスコープ逸脱を防ぐ。

## Implementation readiness gate (実装着手判定)
### 検証観点
- 互換性:
  - 既存の埋め込みパース結果に副作用を持ち込まない（`embedSyntax` の戻り値互換を維持）。
- 運用コスト:
  - 出力先とファイル命名規則を明示し、監査証跡の保管運用を README に追記できる状態にする。
- UI/UX:
  - テンプレート挿入は1コマンドで完結し、既存ショートカットと衝突しないことを確認する。

### 実装判断用コマンド（docs-check / unit / manual-e2e）
- docs-check:
  - `rg -n "ギャップ候補|スニペット|抽出クエリ履歴|エビデンス出力" 04_Documentation/scenario-sier-design-docs.md 01_Plans/issues/issue-0017-phase6-scenario-roi-proof.md 01_Plans/issues/issue-0021-phase6-scenario-product-gap-followup.md`
  - `python3 01_Plans/tools/planning_queue.py`
- unit:
  - `cd 03_Implement && npm test -- autocompleteProvider`
  - `cd 03_Implement && npm test -- diagnostics`
- manual-e2e:
  - `cd 03_Implement && npm run docs:check`
  - `cd 03_Implement && npm run package`

## Validation evidence (実行証跡)
### 2026-03-29 (UTC) Follow-up issue completion check
- Run date (UTC): `2026-03-29`
- Executor: `agent`
- Commands:
  - `rg -n "ギャップ候補|スニペット|抽出クエリ履歴|エビデンス出力" 04_Documentation/scenario-sier-design-docs.md 01_Plans/issues/issue-0017-phase6-scenario-roi-proof.md 01_Plans/issues/issue-0021-phase6-scenario-product-gap-followup.md`
  - `rg -n "issue-0021-phase6-scenario-product-gap-followup" 01_Plans/issues/issue-0017-phase6-scenario-roi-proof.md`
  - `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - 2件の product gap（スニペット、抽出クエリ履歴）の要求根拠を docs / issue 間で再確認。
  - issue-0017 から issue-0021 への参照を確認し、追跡導線が成立。
  - `planning_queue.py` 実行で pending issue / orphan issue の整合を確認。
- Status decision:
  - 受入条件と作業分解の完了を満たしたため、Status を `Done` に更新。
