# Issue: 文脈に沿う値補完と軽量な候補取得

## Meta
- Type: Feature
- Status: Draft
- Priority: High
- Scope: src/dx/autocompleteProvider.ts, src/extension.ts, params.schema.json同期テスト
- Expected verification level: manual-e2e

## Traceability
- Related Requirement: requirements.md「執筆支援」「公開品質」
- Related ADR/Spec: ADR-0016-notation-first-input-assistance.md, 04_Documentation/spec/mmi-notation-v1.md
- Related Design: [ソースモデル](../../02_Architecture/input-assistance-source-model.md)（範囲候補は原本座標で提示する）
- Dependency: issue-0114完了

## Execution Plan
### Proposed solution
[入力支援企画](../input-assistance-proposal.md)の該当範囲を1件ずつ実施する。今回は企画のみで未着手。ADRの提案を具体化してからOpenへ変更する。

### Acceptance criteria
- [ ] 未完成記法のカーソル区間を解析し、途中の値だけを置換して後続記法と本文を保持する。コード例と閉じた記法の外では候補を出さない。
- [ ] 既知キーと値の候補・日本語説明をschemaと同期する。header、mode、orientation等の値を実機で選べる。formatColumnの反復と未知キーを保持する。
- [ ] 選択シートだけから範囲を提示する。固定候補でWorkbookを読まず、mtimeキャッシュとキャンセルを使う。
- [ ] CSV/Excel/XML/TSV、multi-root、IME、Undo、原本変更、遅い旧要求の破棄を検証する。
- [ ] header行番号と範囲省略クエリの既存契約を実装前に照合し、説明の不一致を上流に記録して解決する。

### Validation plan
既存のビルド・単体・Extension Hostを回帰検査する。新しい動作は実VS Codeで確認し、候補選択・キャンセル・Undo・原本ハッシュと通信範囲を記録する。測定値を取得するまでは性能やAI品質の目標を達成済みとしない。

## Remaining work

issue-0114（原本座標の保持）の完了待ち。範囲候補は原本座標で提示する必要があり、先に着手すると二重実装になる。

着手時に解決する未解決事項。

- 範囲候補をどこまで出すか。使用範囲全体か、検出した表領域か。表領域の検出は[CPUでの範囲探索](../../02_Architecture/input-assistance-cpu-search.md)§2と設計を共有する。
- `header`の行番号と範囲省略クエリの既存契約に、仕様と実装の不一致がないか実装前に照合する。
