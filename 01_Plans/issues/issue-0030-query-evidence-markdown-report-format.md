# Issue: Query Evidence Markdown 出力を監査向けレポート形式に改善

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/dx/vscodeAdapters.ts`, `03_Implement/test/queryEvidence.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 6 Documentation feedback loop
- Related ADR/Spec: `01_Plans/issues/issue-0028-phase6-query-evidence-markdown-export.md`

## Execution Plan
### Proposed solution (解決策の概要)
- `buildQueryEvidenceMarkdown` の出力を単なる表文字列から、監査ログへ貼り付けやすいレポート形式（見出し + 件数 + テーブル）へ拡張する。
- records が 0 件の場合にも `_No evidence records found._` を返すようにして関数単体の再利用性を高める。
- 既存 unit test を更新し、新フォーマットと 0 件ケースを固定する。

### Acceptance criteria (受入条件)
- [x] Markdown 出力が見出し・件数・テーブルを含む。
- [x] records が 0 件のとき、説明文を返す。
- [x] `npm test` が通過する。

### Task breakdown (作業分解)
- [x] `vscodeAdapters.ts` の Markdown formatter を更新する。
- [x] `queryEvidence.test.ts` の期待値を更新する。
- [x] `npm test` で回帰確認する。

### Validation plan (検証計画)
- `cd 03_Implement && npm test`

## Validation evidence (実行証跡)
### 2026-03-29 (UTC)
- Run date (UTC): `2026-03-29`
- Executor: `agent`
- Commands:
  - `cd 03_Implement && npm test`
- Result summary:
  - Markdown export を監査向けレポート形式（見出し + 件数 + テーブル）へ更新。
  - records=0 の empty-state レポートを追加。
  - query evidence テストを更新し、全 110 テストが通過。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
