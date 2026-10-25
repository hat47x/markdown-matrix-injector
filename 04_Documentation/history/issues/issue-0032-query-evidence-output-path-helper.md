# Issue: クエリ証跡の出力パス生成を共通関数にまとめる

この文書は、当時の出力パス生成処理の整理と完了状態を残したIssue記録です。検証計画と2026年3月29日の実行証跡は当時のものであり、現在のコード構成や動作を新たに確認したものではありません。

## Meta
- Type: Refactor
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/dx/vscodeAdapters.ts`, `03_Implement/src/extension.ts`, `03_Implement/test/queryEvidence.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 6 Documentation feedback loop
- Related ADR/Spec: `04_Documentation/history/issues/issue-0031-query-evidence-filename-scoping.md`

## 当時の実行計画
### 解決方針（当時の提案）
- 共通関数（helper）`buildQueryEvidenceOutputPaths(markdownFilePath)`を`vscodeAdapters.ts`に追加し、CSV・JSON・Markdownの出力ファイル名を決める規則を一か所にまとめる。
- `extension.ts`ではこの共通関数を使って出力先のパスを計算し、同じファイル名の決定処理が複数箇所に分かれないようにする。
- `queryEvidence.test.ts`に共通関数の単体テストを追加し、元のファイルパスのうちファイル名部分（basename）だけが出力名の接頭部分（prefix）に使われることを確認できるようにする。

### 受入条件（Acceptance criteria）
- [x] 出力パス生成ロジックがhelperに集約される。
- [x] helperのユニットテストが追加される。
- [x] `npm test` が通過する。

### 作業項目（Task breakdown）
- [x] helper実装を追加する。
- [x] extension側でhelperを利用する。
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
  - `buildQueryEvidenceOutputPaths(markdownFilePath)` を追加し、出力パス計算をhelper化。
  - `extension.ts` の出力パス計算をhelper経由へ統一。
  - helperのユニットテストを追加し、全111テストが通過。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
