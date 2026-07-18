# Issue: Query Evidence 出力ファイル名のサニタイズ

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/dx/vscodeAdapters.ts`, `03_Implement/test/queryEvidence.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 6 Documentation feedback loop
- Related ADR/Spec: `01_Plans/issues/issue-0032-query-evidence-output-path-helper.md`

## Execution Plan
### Proposed solution (解決策の概要)
- markdown basename をそのまま使うと空白や記号で扱いづらいケースがあるため、`buildQueryEvidenceOutputPaths` で basename をサニタイズする。
- サニタイズ方針: 英数字・`-`・`_` 以外は `-` へ置換し、連続 `-` を圧縮、先頭/末尾 `-` を除去。空文字になった場合は `markdown` を使用。
- 既存テストを維持しつつ、サニタイズケースの unit test を追加する。

### Acceptance criteria (受入条件)
- [x] 出力ファイル名が安全な basename へ正規化される。
- [x] basename が空になるケースで `markdown` にフォールバックする。
- [x] `npm test` が通過する。

### Task breakdown (作業分解)
- [x] `vscodeAdapters.ts` に basename サニタイズ処理を追加する。
- [x] `queryEvidence.test.ts` にサニタイズケースを追加する。
- [x] `npm test` を実行する。

### Validation plan (検証計画)
- `cd 03_Implement && npm test`

## Validation evidence (実行証跡)
### 2026-03-29 (UTC)
- Run date (UTC): `2026-03-29`
- Executor: `agent`
- Commands:
  - `cd 03_Implement && npm test`
- Result summary:
  - basename サニタイズ（記号置換・連続ハイフン圧縮・先頭末尾トリム）を追加。
  - 空文字化時の `markdown` フォールバックを追加。
  - サニタイズ/フォールバックの unit test を追加し、全 114 テストが通過。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
