# Issue: Windows形式のパスでも証跡レポートに元の文書名を表示できるかテストする

この文書は、当時のWindows形式パスに関する回帰防止テストの追加と完了判定を残したIssue記録です。実装コードの変更は対象とせず、2026年3月31日の検証証跡を現在の実機動作やテスト再実行の確認として扱うものではありません。

## Meta
- Type: Test
- Status: Done
- Priority: Medium
- Scope: `03_Implement/test/queryEvidence.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 6 Documentation feedback loop
- Related ADR/Spec: `01_Plans/issues/issue-0040-query-evidence-windows-path-basename.md`

## 当時の実行計画
### 解決方針（当時の提案）
- `buildQueryEvidenceExportArtifacts`にWindows形式のパスを渡した場合、生成される`markdownReportText`の`Source`行に、元のファイル名部分（basename）である`spec`が入ることを単体テストで確認する。
- 実装コードは変更せず、既存の動作が後の変更で失われないようにするためのテストを追加する。

### 受入条件（Acceptance criteria）
- [x] Windows形式パス入力でartifactのsource metadataがbasenameに正規化されるテストがある。
- [x] `npm test` が通過する。

### 作業項目（Task breakdown）
- [x] unit testを追加する。
- [x] `npm test` を実行する。

### 当時の検証計画（Validation plan）
- `cd 03_Implement && npm test`

## Validation evidence (実行証跡)
### 2026-03-31 (UTC)
- Run date (UTC): `2026-03-31`
- Executor: `agent`
- Commands:
  - `cd 03_Implement && npm test`
  - `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - Windows形式パス入力で `buildQueryEvidenceExportArtifacts` の `markdownReportText` が `- Source: spec` を含むことを検証するテストを追加。
  - unit/integrationを含む全121テストが通過。
  - planning queueはpending/orphanともに0件を確認。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
