# Issue: Query Evidence 出力 basename 長の上限設定

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/dx/vscodeAdapters.ts`, `03_Implement/test/queryEvidence.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 6 Documentation feedback loop
- Related ADR/Spec: `01_Plans/issues/issue-0035-query-evidence-unicode-basename-support.md`

## Execution Plan
### Proposed solution (解決策の概要)
- 極端に長い markdown basename は OS のパス長制約や可読性を悪化させるため、サニタイズ後 basename を 64 文字で切り詰める。
- 末尾が `-` になる場合はトリムし、空になった場合は `markdown` を利用する既存ルールへフォールバックする。
- 長さ上限ケースの unit test を追加する。

### Acceptance criteria (受入条件)
- [x] basename が 64 文字上限で出力される。
- [x] 上限適用後も既存のフォールバック規則が維持される。
- [x] `npm test` が通過する。

### Task breakdown (作業分解)
- [x] サニタイズ後 basename に長さ上限処理を追加する。
- [x] unit test を追加する。
- [x] `npm test` を実行する。

### Validation plan (検証計画)
- `cd 03_Implement && npm test`

## Validation evidence (実行証跡)
### 2026-03-31 (UTC)
- Run date (UTC): `2026-03-31`
- Executor: `agent`
- Commands:
  - `cd 03_Implement && npm test`
- Result summary:
  - basename を 64 文字に切り詰める処理を追加。
  - 切り詰め後の末尾ハイフンを除去し、空文字時は `markdown` へフォールバック。
  - 長さ上限ケースの unit test を追加し、全 117 テストが通過。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
