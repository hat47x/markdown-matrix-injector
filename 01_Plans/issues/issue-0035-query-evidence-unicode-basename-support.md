# Issue: Query Evidence 出力ファイル名で Unicode basename を許容する

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/dx/vscodeAdapters.ts`, `03_Implement/test/queryEvidence.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 6 Documentation feedback loop
- Related ADR/Spec: `01_Plans/issues/issue-0034-query-evidence-filename-sanitization.md`

## Execution Plan
### Proposed solution (解決策の概要)
- basenameサニタイズでASCII英数字のみ許容しているため、日本語などUnicode文書名が `markdown` へフォールバックしやすい。
- 正規化ルールをUnicode文字クラス（`\p{L}` / `\p{N}`）対応へ拡張し、非ASCII文字を保持したまま記号のみ `-` へ置換する。
- Unicode basenameと記号混在ケースのunit testを追加する。

### Acceptance criteria (受入条件)
- [x] Unicode basename（例: 日本語ファイル名）が保持される。
- [x] 記号混在時も既存のハイフン正規化ルールは維持される。
- [x] `npm test` が通過する。

### Task breakdown (作業分解)
- [x] サニタイズ正規表現をUnicode対応へ更新する。
- [x] unit testを追加する。
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
  - basenameサニタイズをUnicode文字クラス対応へ更新。
  - 日本語basename保持ケースおよび記号正規化ケースをテスト追加。
  - 全116テストが通過。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
