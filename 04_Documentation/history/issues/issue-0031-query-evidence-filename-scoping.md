# Issue: クエリ証跡の出力ファイル名を文書ごとに区別する

この文書は、当時のクエリ証跡出力に関するファイル名の変更提案と完了状態を残したIssue記録です。受入条件・検証計画と2026年3月29日の実行証跡は当時の内容であり、現行の実装やテスト結果を新たに確認したものではありません。

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/extension.ts`, `03_Implement/test/extensionIntegration.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 6 Documentation feedback loop
- Related ADR/Spec: `04_Documentation/history/issues/issue-0028-phase6-query-evidence-markdown-export.md`

## 当時の実行計画
### 解決方針（当時の提案）
- 当時の固定ファイル名`query-evidence.*`を、元のMarkdown文書名を含む`<markdown-basename>.query-evidence.*`に変更する。同じフォルダーで複数の文書を扱っても、出力ファイルが互いに上書きされないようにする。
- 変更するのはexport実行時の出力先の計算だけとし、CSV・JSON・Markdownの各ファイルに書き出す内容の仕様は変えない。
- 統合テストのソース検証（integration source assertion）を更新し、新しいファイル名の規則を確認できるようにする。

### 受入条件（Acceptance criteria）
- [x] 出力ファイル名が文書basenameを含む（例: `spec.query-evidence.csv`）。
- [x] CSV/JSON/MDの3形式出力は維持される。
- [x] `npm test` が通過する。

### 作業項目（Task breakdown）
- [x] `extension.ts` の出力パス組み立てを更新する。
- [x] `extensionIntegration.test.ts` のsource assertionを更新する。
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
  - 出力ファイル名を `<basename>.query-evidence.(csv|json|md)` に変更。
  - integration source assertionを新命名規則に更新。
  - 全110テストが通過。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
