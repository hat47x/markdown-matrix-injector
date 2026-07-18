# 01_Plans Issue Memo Index

このディレクトリは、実装タスクを管理するための **短命メモ (Issue Memo)** を管理する。
Decision（決定）は ADR、Action（実行）は issue memo で管理し、本ディレクトリはタスクの再開性と品質担保に限定する。

## Scope & Lifecycle

- **対象**: 実装、テスト、リファクタリングなどの具体的なアクション。
- **ライフサイクル**: `Draft` -> `Open` -> `In Progress` -> `Done`
  - `Draft`: タスクの洗い出し中。受入条件が未確定。
  - `Open`: 受入条件と検証計画が確定し、着手可能。
  - `In Progress`: 実作業中。
  - `Done`: 受入条件を完全に満たし、検証が完了した状態。
- `Done` になったメモは自動削除せず、履歴として保管する。

## Start here (人間 / 生成AI 共通の起票フロー)

新規タスクを開始する際は、以下のステップとテンプレートに従って `issue-XXXX-title.md` を作成する。

1. `Type / Status / Scope / Related ADR` のメタ情報を埋める。
2. `Expected verification level` (後述) を宣言する。
3. 実装の前に、必ず **受入条件 (Acceptance criteria)** と **検証計画 (Validation plan)** を確定させる。

### Expected verification level (検証レベルの宣言)

VSCode拡張機能の開発において、「どこまでテストするか」を事前に宣言する。上位レベルは下位レベルを内包する。

| Level | 最低実施内容 | 代表的な確認方法 |
|---|---|---|
| `docs-check` | 静的解析、Linter、型チェック | `npm run lint`, `tsc --noEmit` |
| `unit` | 対象モジュールの単体テスト | `npm run test` (Jest / Mocha) |
| `integration` | VSCode Extension Host 上での結合テスト | `@vscode/test-electron` を用いたテスト実行 |
| `manual-e2e` | 実際のVSCode上での目視と手動操作確認 | F5キーでのデバッグ実行、カードUIの表示確認 |

---

## 📄 Issue Memo Template

新規作成時は以下のフォーマットをコピーして使用すること。ファイル名は `issue-001-setup-parser.md` のような形式とする。

```markdown
# Issue: [タスクの概要を記載]

## Meta
- Type: [Feature | Bugfix | Refactor | Docs | Test]
- Status: [Draft | Open | In Progress | Done]
- Priority: [High | Medium | Low]
- Scope: [影響するモジュール。例: src/parser]
- Expected verification level: [docs-check | unit | integration | manual-e2e]

## Traceability
- Related Backlog/Phase: [要件定義書のどのフェーズに該当するか]
- Related ADR/Spec: [関連するADRや設計書のパス]

## Execution Plan
### Proposed solution (解決策の概要)
- どのように実装・修正を行うかの方針。

### Acceptance criteria (受入条件)
- [ ] この条件を満たせばタスク完了とする、という明確な基準。
- [ ] (安全・後方互換) 既存のパース処理に影響を与えないこと。

### Task breakdown (作業分解)
- [ ] サブタスク1
- [ ] サブタスク2

### Validation plan (検証計画)
- 実装後、具体的にどのようなコマンドや操作を行って受入条件を確認するか。
- 例: `npm run test` がすべてPassすることを確認する。
