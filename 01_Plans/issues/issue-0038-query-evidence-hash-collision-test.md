# Issue: Query Evidence basename ハッシュ接尾辞の衝突回避テスト追加

## Meta
- Type: Test
- Status: Done
- Priority: Medium
- Scope: `03_Implement/test/queryEvidence.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 6 Documentation feedback loop
- Related ADR/Spec: `01_Plans/issues/issue-0037-query-evidence-basename-hash-suffix.md`

## Execution Plan
### Proposed solution (解決策の概要)
- 長い basename 同士で先頭57文字が同一なケースに対し、hash suffix によって最終出力名が分岐することを unit test で固定する。
- 実装コード変更は行わず、回帰防止テストを強化する。

### Acceptance criteria (受入条件)
- [x] 先頭57文字が同一でも hash suffix でファイル名が異なることを検証するテストがある。
- [x] `npm test` が通過する。

### Task breakdown (作業分解)
- [x] 衝突回避テストを追加する。
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
  - 先頭57文字が同一な長文basename 2 件で、hash suffix により csv 出力名が分岐するテストを追加。
  - 正規表現で `-<hex6>` 形式を検証し、衝突回避ルールを固定。
  - 全 118 テストが通過。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
