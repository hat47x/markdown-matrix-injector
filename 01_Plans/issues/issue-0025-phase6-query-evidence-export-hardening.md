# Issue: Phase 6 Query Evidence Export Hardening（未保存文書とI/O失敗の保護）

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/extension.ts`, `03_Implement/test/extensionIntegration.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 6 Documentation feedback loop
- Related ADR/Spec: `01_Plans/issues/issue-0024-phase6-query-evidence-json-export.md`

## Execution Plan
### Proposed solution (解決策の概要)
- `__dev.exportQueryEvidence` で未保存 (`untitled`) 文書を検知して警告し、無効パスへの書き込みを防止する。
- ファイル書き込み失敗時にエラー通知を表示し、失敗理由をユーザーに伝達する。

### Acceptance criteria (受入条件)
- [x] 未保存文書では export を中断し、警告メッセージを表示する。
- [x] I/O失敗時にエラーメッセージを表示する。
- [x] 既存テストを含む `npm test` が通過する。

### Task breakdown (作業分解)
- [x] `extension.ts` に guard / error handling を追加する。
- [x] `extensionIntegration.test.ts` に source-level assertion を追加する。
- [x] `npm test` で回帰確認する。

### Validation plan (検証計画)
- `cd 03_Implement && npm test`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
### 2026-03-29 (UTC)
- Run date (UTC): `2026-03-29`
- Executor: `agent`
- Commands:
  - `cd 03_Implement && npm test`
  - `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - `document.isUntitled` guard で未保存Markdownからの誤エクスポートを防止。
  - I/O失敗時に `showErrorMessage` で理由を通知する処理を追加。
  - `extensionIntegration.test.ts` の source assertion を追加し、回帰なく全テスト通過。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
