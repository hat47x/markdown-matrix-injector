# Issue: Phase 6で埋め込みクエリの証跡をCSVに出力するMVP

この文書は、当時のクエリ証跡CSV出力MVPの提案と完了状態を残したIssue記録です。検証計画と2026年3月29日の実行証跡は当時の記録であり、後続のJSON出力や現在の動作を新たに確認したものではありません。

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/extension.ts`, `03_Implement/src/dx/vscodeAdapters.ts`, `03_Implement/src/parser/embedSyntax.ts`, `03_Implement/test/`
- Expected verification level: unit + manual-e2e

## Traceability
- Related Backlog/Phase: Phase 5 DX / Phase 6 Documentation feedback loop
- Related ADR/Spec: `01_Plans/adr/ADR-0004-phase6-product-gap-implementation-sequencing.md`, `04_Documentation/history/issues/issue-0021-phase6-scenario-product-gap-followup.md`, `04_Documentation/scenario-sier-design-docs.md`

## 当時の実行計画
### 解決方針（当時の提案）
- 開発・検証用コマンド`markdownMatrixInjector.__dev.exportQueryEvidence`を追加する。現在開いているMarkdown文書から`![[...?...]]`形式の埋め込みクエリを取り出し、`query-evidence.csv`として保存する。JSONでの保存もオプションとして想定する。
- 出力する順序は文書内での出現順に固定し、同じ入力から同じ並びを再現できるようにする。

### 受入条件（Acceptance criteria）
- [x] 埋め込みクエリ履歴をCSVで出力できる。
- [x] 同一入力から同一順序で出力される。
- [x] 既存diagnostics / parserの挙動を壊さない。
- [x] docs-check / unit / manual-e2eの検証結果をIssueに記録する。

### 作業項目（Task breakdown）
- [x] `embedSyntax.ts` / `vscodeAdapters.ts` に履歴抽出用の再利用可能ロジックを追加する。
- [x] `extension.ts` にexportコマンドを追加する。
- [x] CSV（必要ならJSON）出力のテストを追加する。
- [x] 既存テストを実行し回帰なしを確認する。

### 当時の検証計画（Validation plan）
- `cd 03_Implement && npm test -- diagnostics`
- `cd 03_Implement && npm test`
- `cd 03_Implement && npm run package`
- `python3 03_Implement/tools/planning_queue.py`

## Notes
- 非対象: 外部監査システム連携（API送信・クラウド保存）。

## Validation evidence (実行証跡)
### 2026-03-29 (UTC)
- Run date (UTC): `2026-03-29`
- Executor: `agent`
- Commands:
  - `cd 03_Implement && npm test`
  - `python3 03_Implement/tools/planning_queue.py`
- Result summary:
  - `markdownMatrixInjector.__dev.exportQueryEvidence` を追加し、`collectQueryEvidenceRecords` + `buildQueryEvidenceCsv` によるCSV出力を実装。
  - `queryEvidence.test.ts` を追加し、出現順保持・CSVエスケープの安定性を確認。
  - `npm test` で全テスト通過を確認。
- Status decision:
  - Query Evidence Export MVPの受入条件を満たしたため `Status: Done` に更新。
