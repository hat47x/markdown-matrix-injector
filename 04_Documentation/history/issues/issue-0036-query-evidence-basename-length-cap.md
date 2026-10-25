# Issue: クエリ証跡の出力ファイル名に使う文書名を64文字以内にする

この文書は、当時の出力ファイル名の長さ制限に関する提案と完了状態を残したIssue記録です。64文字の上限と既存の正規化・フォールバック規則の扱いを記録したものであり、2026年3月31日の実行証跡を現在の実装確認として扱うものではありません。

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/dx/vscodeAdapters.ts`, `03_Implement/test/queryEvidence.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 6 Documentation feedback loop
- Related ADR/Spec: `04_Documentation/history/issues/issue-0035-query-evidence-unicode-basename-support.md`

## 当時の実行計画
### 解決方針（当時の提案）
- 元のMarkdown文書名（basename）が極端に長いと、OSのパス長の制約やファイル名の読みやすさに影響する。そのため、正規化後の文書名を64文字で切り詰める。
- 切り詰めた結果、末尾が`-`になった場合は取り除く。結果が空文字になったときは、既存の規則どおり`markdown`を使う。
- 64文字の上限が適用される場合の単体テストを追加する。

### 受入条件（Acceptance criteria）
- [x] basenameが64文字上限で出力される。
- [x] 上限適用後も既存のフォールバック規則が維持される。
- [x] `npm test` が通過する。

### 作業項目（Task breakdown）
- [x] サニタイズ後basenameに長さ上限処理を追加する。
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
- Result summary:
  - basenameを64文字に切り詰める処理を追加。
  - 切り詰め後の末尾ハイフンを除去し、空文字時は `markdown` へフォールバック。
  - 長さ上限ケースのunit testを追加し、全117テストが通過。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
