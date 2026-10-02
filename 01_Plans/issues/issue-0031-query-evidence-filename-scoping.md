# Issue: Query Evidence Export のファイル名を文書単位にスコープする

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/extension.ts`, `03_Implement/test/extensionIntegration.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 6 Documentation feedback loop
- Related ADR/Spec: `01_Plans/issues/issue-0028-phase6-query-evidence-markdown-export.md`

## Execution Plan
### Proposed solution (解決策の概要)
- 現在の固定ファイル名 `query-evidence.*` を `<markdown-basename>.query-evidence.*` へ変更し、複数文書を同一ディレクトリで扱う際の上書き衝突を回避する。
- 変更はexport実行時の出力先計算のみとし、CSV/JSON/MDの内容仕様は変更しない。
- integration source assertionを更新し、新しい命名ルールを固定する。

### Acceptance criteria (受入条件)
- [x] 出力ファイル名が文書basenameを含む（例: `spec.query-evidence.csv`）。
- [x] CSV/JSON/MDの3形式出力は維持される。
- [x] `npm test` が通過する。

### Task breakdown (作業分解)
- [x] `extension.ts` の出力パス組み立てを更新する。
- [x] `extensionIntegration.test.ts` のsource assertionを更新する。
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
  - 出力ファイル名を `<basename>.query-evidence.(csv|json|md)` に変更。
  - integration source assertionを新命名規則に更新。
  - 全110テストが通過。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
