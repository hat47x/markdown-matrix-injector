# Issue: Query Evidence Export の空結果ガード追加

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/extension.ts`, `03_Implement/test/queryEvidence.test.ts`, `03_Implement/test/extensionIntegration.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 6 Documentation feedback loop
- Related ADR/Spec: `01_Plans/issues/issue-0028-phase6-query-evidence-markdown-export.md`

## Execution Plan
### Proposed solution (解決策の概要)
- `__dev.exportQueryEvidence` 実行時、埋め込み記法が 0 件ならファイル出力を中断し、警告メッセージを表示する。
- 空データの CSV/JSON/MD を生成しないことで、監査成果物として誤解を招く空ファイルの混入を防止する。
- source assertion と query evidence unit test を更新し、空結果ガードの回帰を防ぐ。

### Acceptance criteria (受入条件)
- [x] records が 0 件の場合、出力処理を中断して warning を表示する。
- [x] 既存の query evidence 出力（records > 0）は維持される。
- [x] `npm test` が通過する。

### Task breakdown (作業分解)
- [x] `extension.ts` に空結果ガードを追加する。
- [x] `extensionIntegration.test.ts` の source assertion を更新する。
- [x] `queryEvidence.test.ts` に空文書ケースを追加する。
- [x] `npm test` 実行で回帰確認する。

### Validation plan (検証計画)
- `cd 03_Implement && npm test`

## Validation evidence (実行証跡)
### 2026-03-29 (UTC)
- Run date (UTC): `2026-03-29`
- Executor: `agent`
- Commands:
  - `cd 03_Implement && npm test`
  - `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - 空文書時に `No embed query evidence found` 警告を返して export を中断するガードを追加。
  - source assertion と unit test に空結果ケースを追加。
  - 全 109 テストが通過し、回帰なし。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
