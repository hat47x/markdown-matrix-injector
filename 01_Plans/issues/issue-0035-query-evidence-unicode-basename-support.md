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
- basename サニタイズで ASCII 英数字のみ許容しているため、日本語など Unicode 文書名が `markdown` へフォールバックしやすい。
- 正規化ルールを Unicode 文字クラス（`\p{L}` / `\p{N}`）対応へ拡張し、非ASCII文字を保持したまま記号のみ `-` へ置換する。
- Unicode basename と記号混在ケースの unit test を追加する。

### Acceptance criteria (受入条件)
- [x] Unicode basename（例: 日本語ファイル名）が保持される。
- [x] 記号混在時も既存のハイフン正規化ルールは維持される。
- [x] `npm test` が通過する。

### Task breakdown (作業分解)
- [x] サニタイズ正規表現を Unicode 対応へ更新する。
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
  - basename サニタイズを Unicode 文字クラス対応へ更新。
  - 日本語 basename 保持ケースおよび記号正規化ケースをテスト追加。
  - 全 116 テストが通過。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
