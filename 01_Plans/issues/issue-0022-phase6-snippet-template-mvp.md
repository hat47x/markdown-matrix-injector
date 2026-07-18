# Issue: Phase 6 Snippet Template MVP（観点別テンプレート自動挿入）

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: `03_Implement/src/extension.ts`, `03_Implement/src/dx/autocompleteProvider.ts`, `03_Implement/test/`
- Expected verification level: unit + manual-e2e

## Traceability
- Related Backlog/Phase: Phase 5 DX / Phase 6 Documentation feedback loop
- Related ADR/Spec: `01_Plans/adr/ADR-0004-phase6-product-gap-implementation-sequencing.md`, `01_Plans/issues/issue-0021-phase6-scenario-product-gap-followup.md`, `04_Documentation/scenario-sier-design-docs.md`

## Execution Plan
### Proposed solution (解決策の概要)
- ユーザ価値の主経路は `autocompleteProvider` による Markdown 文脈でのテンプレート候補提示（重複見出し抑制）とし、通常コマンド導線を汚染しない。
- テンプレート一括挿入は `markdownMatrixInjector.__dev.insertScenarioObservationTemplate`（開発/検証用）に限定し、一般コマンドパレットには公開しない。

### Acceptance criteria (受入条件)
- [x] 開発/検証用コマンド経由で観測テンプレートを挿入できる。
- [x] テンプレート補完候補が適切な文脈で表示され、重複時に抑制される。
- [x] 既存 `![[...]]` 系補完・パース挙動を壊さない。
- [x] docs-check / unit / manual-e2e の検証結果を Issue に記録する。

### Task breakdown (作業分解)
- [x] `extension.ts` に開発/検証用コマンド登録と挿入処理を追加する。
- [x] `autocompleteProvider.ts` にテンプレート候補ロジックを追加する。
- [x] 該当ユニットテストを追加・更新する。
- [x] 既存テストを実行し回帰なしを確認する。

### Validation plan (検証計画)
- `cd 03_Implement && npm test -- autocompleteProvider`
- `cd 03_Implement && npm test`
- `cd 03_Implement && npm run package`
- `python3 01_Plans/tools/planning_queue.py`

## Notes
- 非対象: クエリ履歴CSV/JSON出力（issue-0023で対応）。

## Validation evidence (実行証跡)
### 2026-03-29 (UTC)
- Run date (UTC): `2026-03-29`
- Executor: `agent`
- Commands:
  - `cd 03_Implement && npm test`
  - `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - `npm test` で 103 tests passed（fail 0）を確認。
  - 新規追加した観測テンプレート補助ロジックの単体テストを含めて回帰なし。
  - planning queue 上で issue-0023 のみ pending として残る状態を確認。
- Status decision:
  - Snippet MVP の受入条件を満たしたため `Status: Done` に更新。
