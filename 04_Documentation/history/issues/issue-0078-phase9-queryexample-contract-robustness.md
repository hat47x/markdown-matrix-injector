# Issue: Phase 9のQueryExample契約テストで入力検査とRuleId照合を強化する

この文書は、Phase 9のQueryExample契約テストを堅牢化する方針と当時の完了判断を残したIssue記録です。2026年4月6日の検証証跡は当時の結果であり、現行実装や将来のID命名規則を新たに確認・確定したものではありません。

## Meta
- Type: Docs
- Status: Done
- Priority: Medium
- Scope: `03_Implement/test/`, `04_Documentation/history/issues/`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 9 Rule Table Interoperability & Design Assetization
- Related ADR/Spec: `01_Plans/adr/ADR-0008-phase9-template-sync-quality-gate-hardening.md`

## 当時の実行計画
### 解決方針（当時の提案）
- `QueryExample`を使う契約テストで、`RuleId`と`QueryExample`が空でないことを明示的に確認する。入力条件を満たさない場合の原因を分かりやすくする。
- `RuleId`の照合では正規表現の特殊文字をエスケープし、将来IDに記号が含まれる場合にも誤判定しないようにする。

### 受入条件（Acceptance criteria）
- [x] `markdownMatrixPlugin.test.ts` がRuleId/QueryExample空値を明示検知する。
- [x] RuleIdマッチ判定が正規表現エスケープ付きになる。
- [x] `cd 03_Implement && npm test` が成功する。
- [x] `python3 03_Implement/tools/planning_queue.py` 実行時にorphan issueが0件である。

### 作業項目（Task breakdown）
- [x] contract testを堅牢化する。
- [x] npm testとplanning queueを実行する。

### 当時の検証計画（Validation plan）
- `cd 03_Implement && npm test`
- `python3 03_Implement/tools/planning_queue.py`

## Validation evidence (実行証跡)
- 2026-04-06: `cd 03_Implement && npm test`（`test:unit` + `test:phase9-sync` ともに成功）
- 2026-04-06: `python3 03_Implement/tools/planning_queue.py`（`issue_pending: 0`, `issue_orphan: 0`）
