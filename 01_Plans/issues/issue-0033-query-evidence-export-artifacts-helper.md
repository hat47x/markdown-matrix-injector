# Issue: クエリ証跡の各形式の出力内容を共通関数でまとめて生成する

この文書は、当時のクエリ証跡出力処理を共通関数へまとめる提案と完了状態を残したIssue記録です。受入条件・検証計画と2026年3月29日の実行証跡は当時の内容であり、現在の実装を新たに確認したものではありません。

## Meta
- Type: Refactor
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/dx/vscodeAdapters.ts`, `03_Implement/src/extension.ts`, `03_Implement/test/queryEvidence.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 6 Documentation feedback loop
- Related ADR/Spec: `01_Plans/issues/issue-0032-query-evidence-output-path-helper.md`

## 当時の実行計画
### 解決方針（当時の提案）
- 共通関数（helper）`buildQueryEvidenceExportArtifacts(markdownText, markdownFilePath)`を追加し、records / csv / json / markdown / pathsをまとめて生成する。
- `extension.ts`では共通関数の戻り値を使ってexport処理を行い、出力形式ごとの生成処理が複数箇所に分散しないようにする。
- `queryEvidence.test.ts`に共通関数の単体テストを追加し、複数の出力内容がまとめて生成される結果を検証する。

### 受入条件（Acceptance criteria）
- [x] export生成物がhelperから一括取得できる。
- [x] extension側のexport処理がhelper利用へ更新される。
- [x] `npm test` が通過する。

### 作業項目（Task breakdown）
- [x] helperを実装する。
- [x] extensionのexport実装をhelper利用へ更新する。
- [x] unit testを追加する。
- [x] `npm test` を実行する。

### 当時の検証計画（Validation plan）
- `cd 03_Implement && npm test`

## Validation evidence (実行証跡)
### 2026-03-29 (UTC)
- Run date (UTC): `2026-03-29`
- Executor: `agent`
- Commands:
  - `cd 03_Implement && npm test`
- Result summary:
  - `buildQueryEvidenceExportArtifacts` を追加し、records/csv/json/markdown/pathsを一括生成。
  - extension側export処理をhelper利用へ更新。
  - helperのunit testを追加し、全112テストが通過。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
