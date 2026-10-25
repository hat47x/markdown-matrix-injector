# Issue: クエリ証跡の出力完了メッセージに元の文書名を表示する

この文書は、当時のクエリ証跡出力完了メッセージの改善と完了判定を残したIssue記録です。抽出元の文書名を通知に含める方針と2026年3月31日の検証結果は当時の内容であり、現在の実装を新たに確認したものではありません。

## Meta
- Type: Feature
- Status: Done
- Priority: Low
- Scope: `03_Implement/src/dx/vscodeAdapters.ts`, `03_Implement/src/extension.ts`, `03_Implement/test/queryEvidence.test.ts`, `03_Implement/test/extensionIntegration.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 6 Documentation feedback loop
- Related ADR/Spec: `04_Documentation/history/issues/issue-0039-query-evidence-markdown-source-metadata.md`

## 当時の実行計画
### 解決方針（当時の提案）
- `buildQueryEvidenceExportArtifacts`の戻り値に、抽出元の文書名を表す`sourceName`を含める。
- 出力完了メッセージに`for <sourceName>`を加え、複数の文書について続けて実行した場合も、どの文書の出力が終わったか分かるようにする。
- 単体テストと統合テストの検証項目（assertion）を更新し、既存の動作が後の変更で損なわれないようにする。

### 受入条件（Acceptance criteria）
- [x] export完了メッセージにsource名が含まれる。
- [x] artifact helperがsourceNameを返す。
- [x] `npm test` が通過する。

### 作業項目（Task breakdown）
- [x] artifact helperの戻り値を拡張する。
- [x] extension完了メッセージを更新する。
- [x] unit/integration testを更新する。
- [x] `npm test` を実行する。

### 当時の検証計画（Validation plan）
- `cd 03_Implement && npm test`

## Validation evidence (実行証跡)
### 2026-03-31 (UTC)
- Run date (UTC): `2026-03-31`
- Executor: `agent`
- Commands:
  - `cd 03_Implement && npm test`
  - `python3 03_Implement/tools/planning_queue.py`
- Result summary:
  - artifact helper戻り値へ `sourceName` を追加。
  - export完了メッセージを `for ${sourceName}` 付きへ更新。
  - unit/integrationを更新し、全121テストが通過。
  - planning queueはpending/orphanともに0件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
