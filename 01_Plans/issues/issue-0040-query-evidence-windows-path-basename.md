# Issue: Query Evidence 出力で Windows 形式パスの basename を正しく解決する

## Meta
- Type: Bugfix
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/dx/vscodeAdapters.ts`, `03_Implement/test/queryEvidence.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 6 Documentation feedback loop
- Related ADR/Spec: `01_Plans/issues/issue-0032-query-evidence-output-path-helper.md`

## Execution Plan
### Proposed solution (解決策の概要)
- 現在の basename 抽出は実行環境依存で、POSIX 実行下では Windows 形式パス文字列（`C:\...\spec.md`）を正しく分解できない。
- パスに `\\` を含む場合は `path.win32` 系 API を使って basename/dirname/extname を抽出し、出力パス構築を安定化する。
- Windows 形式入力を想定した unit test を追加する。

### Acceptance criteria (受入条件)
- [x] Windows 形式パスでも basename が正しく抽出される。
- [x] 既存の POSIX パス動作は維持される。
- [x] `npm test` が通過する。

### Task breakdown (作業分解)
- [x] cross-platform basename/dirname 抽出処理を追加する。
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
  - Windows 形式パス文字列検知時に `path.win32` ベースで dirname/basename/extname を解決する実装を追加。
  - Windows パス入力テストを追加し、出力パス区切りが `\\` で構築されることを確認。
  - 全 120 テストが通過。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
