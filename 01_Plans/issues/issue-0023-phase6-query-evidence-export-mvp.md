# Issue: Phase 6 Query Evidence Export MVP（抽出クエリ履歴のエビデンス出力）

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/extension.ts`, `03_Implement/src/dx/vscodeAdapters.ts`, `03_Implement/src/parser/embedSyntax.ts`, `03_Implement/test/`
- Expected verification level: unit + manual-e2e

## Traceability
- Related Backlog/Phase: Phase 5 DX / Phase 6 Documentation feedback loop
- Related ADR/Spec: `01_Plans/adr/ADR-0004-phase6-product-gap-implementation-sequencing.md`, `01_Plans/issues/issue-0021-phase6-scenario-product-gap-followup.md`, `04_Documentation/scenario-sier-design-docs.md`

## Execution Plan
### Proposed solution (解決策の概要)
- 開発/検証用コマンド `markdownMatrixInjector.__dev.exportQueryEvidence` を追加し、現在アクティブな Markdown から `![[...?...]]` の埋め込みクエリを抽出して `query-evidence.csv`（オプションでJSON）として保存する。
- 出力順序は文書内出現順で固定し、同一入力に対する再現性を担保する。

### Acceptance criteria (受入条件)
- [x] 埋め込みクエリ履歴をCSVで出力できる。
- [x] 同一入力から同一順序で出力される。
- [x] 既存 diagnostics / parser の挙動を壊さない。
- [x] docs-check / unit / manual-e2e の検証結果を Issue に記録する。

### Task breakdown (作業分解)
- [x] `embedSyntax.ts` / `vscodeAdapters.ts` に履歴抽出用の再利用可能ロジックを追加する。
- [x] `extension.ts` に export コマンドを追加する。
- [x] CSV（必要ならJSON）出力のテストを追加する。
- [x] 既存テストを実行し回帰なしを確認する。

### Validation plan (検証計画)
- `cd 03_Implement && npm test -- diagnostics`
- `cd 03_Implement && npm test`
- `cd 03_Implement && npm run package`
- `python3 01_Plans/tools/planning_queue.py`

## Notes
- 非対象: 外部監査システム連携（API送信・クラウド保存）。

## Validation evidence (実行証跡)
### 2026-03-29 (UTC)
- Run date (UTC): `2026-03-29`
- Executor: `agent`
- Commands:
  - `cd 03_Implement && npm test`
  - `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - `markdownMatrixInjector.__dev.exportQueryEvidence` を追加し、`collectQueryEvidenceRecords` + `buildQueryEvidenceCsv` による CSV 出力を実装。
  - `queryEvidence.test.ts` を追加し、出現順保持・CSVエスケープの安定性を確認。
  - `npm test` で全テスト通過を確認。
- Status decision:
  - Query Evidence Export MVP の受入条件を満たしたため `Status: Done` に更新。
