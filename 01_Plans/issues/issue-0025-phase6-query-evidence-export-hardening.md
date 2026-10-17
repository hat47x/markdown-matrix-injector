# Issue: Phase 6のクエリ証跡出力で未保存文書と書き込み失敗に対応する

この文書は、Phase 6当時のクエリ証跡出力に関する保護処理の提案と完了状態を残したIssue記録です。受入条件・検証計画と2026年3月29日の実行証跡は当時の内容であり、現在の動作を新たに確認したものではありません。

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/extension.ts`, `03_Implement/test/extensionIntegration.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 6 Documentation feedback loop
- Related ADR/Spec: `01_Plans/issues/issue-0024-phase6-query-evidence-json-export.md`

## 当時の実行計画
### 解決方針（当時の提案）
- `__dev.exportQueryEvidence` の実行時に、まだ保存されていない文書（`untitled`）を検知して警告する。これにより、有効な保存先がない状態での書き込みを防ぐ。
- ファイルへの書き込みに失敗した場合はエラーを通知し、利用者が失敗理由を把握できるようにする。

### 受入条件（Acceptance criteria）
- [x] 未保存文書ではexportを中断し、警告メッセージを表示する。
- [x] I/O失敗時にエラーメッセージを表示する。
- [x] 既存テストを含む `npm test` が通過する。

### 作業項目（Task breakdown）
- [x] `extension.ts` にguard / error handlingを追加する。
- [x] `extensionIntegration.test.ts` にsource-level assertionを追加する。
- [x] `npm test` で回帰確認する。

### 当時の検証計画（Validation plan）
- `cd 03_Implement && npm test`
- `python3 01_Plans/tools/planning_queue.py`

## Validation evidence (実行証跡)
### 2026-03-29 (UTC)
- Run date (UTC): `2026-03-29`
- Executor: `agent`
- Commands:
  - `cd 03_Implement && npm test`
  - `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - `document.isUntitled` guardで未保存Markdownからの誤エクスポートを防止。
  - I/O失敗時に `showErrorMessage` で理由を通知する処理を追加。
  - `extensionIntegration.test.ts` のsource assertionを追加し、回帰なく全テスト通過。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
