# Issue: クエリ証跡が0件のときはファイル出力を中断する

この文書は、当時のクエリ証跡出力における空結果の扱いと完了状態を残したIssue記録です。ここで扱う出力コマンドの中断と、後続Issueで扱うMarkdown整形関数の0件表示は別の挙動です。以下の検証結果を現行動作の再確認として扱うものではありません。

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/extension.ts`, `03_Implement/test/queryEvidence.test.ts`, `03_Implement/test/extensionIntegration.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: Phase 6 Documentation feedback loop
- Related ADR/Spec: `01_Plans/issues/issue-0028-phase6-query-evidence-markdown-export.md`

## 当時の実行計画
### 解決方針（当時の提案）
- `__dev.exportQueryEvidence`の実行時に埋め込み記法が1件も見つからなければ、ファイルの出力を中断し、警告メッセージを表示する。
- データが空のCSV・JSON・Markdownファイルは作らず、内容のないファイルが監査用の成果物に紛れ込むことを防ぐ。
- ソースに対する検証（source assertion）とクエリ証跡の単体テストを更新し、0件の場合に出力を止める動作が後の変更で損なわれないようにする。

### 受入条件（Acceptance criteria）
- [x] recordsが0件の場合、出力処理を中断してwarningを表示する。
- [x] 既存のquery evidence出力（records > 0）は維持される。
- [x] `npm test` が通過する。

### 作業項目（Task breakdown）
- [x] `extension.ts` に空結果ガードを追加する。
- [x] `extensionIntegration.test.ts` のsource assertionを更新する。
- [x] `queryEvidence.test.ts` に空文書ケースを追加する。
- [x] `npm test` 実行で回帰確認する。

### 当時の検証計画（Validation plan）
- `cd 03_Implement && npm test`

## Validation evidence (実行証跡)
### 2026-03-29 (UTC)
- Run date (UTC): `2026-03-29`
- Executor: `agent`
- Commands:
  - `cd 03_Implement && npm test`
  - `python3 01_Plans/tools/planning_queue.py`
- Result summary:
  - 空文書時に `No embed query evidence found` 警告を返してexportを中断するガードを追加。
  - source assertionとunit testに空結果ケースを追加。
  - 全109テストが通過し、回帰なし。
- Status decision:
  - 受入条件を満たしたため `Status: Done` に更新。
