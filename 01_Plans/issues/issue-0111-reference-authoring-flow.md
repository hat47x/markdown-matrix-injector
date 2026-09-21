# Issue: 表参照の作成・編集と修正候補

## Meta
- Type: Feature
- Status: Draft
- Priority: High
- Scope: src/dx（作成/編集UI）, extension.ts, parser, docs
- Expected verification level: manual-e2e

## Traceability
- Related Requirement: requirements.md「執筆支援」「公開品質」
- Related ADR/Spec: ADR-0016-notation-first-input-assistance.md, 04_Documentation/spec/mmi-notation-v1.md
- Related Design: [ソースモデル](../../02_Architecture/input-assistance-source-model.md)（プレビューと範囲評価）、[クリップボード出所と照合](../../02_Architecture/input-assistance-paste-provenance.md)§7（候補提示の見せ方）
- Dependency: issue-0110完了

## Execution Plan
### Proposed solution
[入力支援企画](../input-assistance-proposal.md)の該当範囲を1件ずつ実施する。今回は企画のみで未着手。ADRの提案を具体化してからOpenへ変更する。

### Acceptance criteria
- [ ] ファイル→シート→範囲→表示→確認→挿入をキーボードで完了できる。戻る/中止では文書を変更しない。
- [ ] 既存記法を読み込んで対象項目だけを更新する。未知キーと繰返しキーを失わない。Undo1回で元に戻る。
- [ ] 実在する修正先だけをCode Actionに提示。候補が複数なら選択させ、解析できない記法を全置換しない。
- [ ] 実エンジンのプレビューで0件・カード化・エラーを表示。文書version/原本mtimeが変わったら再検証する。
- [ ] 原本ハッシュ不変を確認し、初めて使う人と熟練者の表作成・別紙作成・参照変更を実機で観測する。

### Validation plan
既存のビルド・単体・Extension Hostを回帰検査する。新しい動作は実VS Codeで確認し、候補選択・キャンセル・Undo・原本ハッシュと通信範囲を記録する。測定値を取得するまでは性能やAI品質の目標を達成済みとしない。

## Remaining work

issue-0110の完了待ち。補完の候補取得と同じ経路を使うため、先に着手すると重複する。

着手時に解決する未解決事項。

- プレビューは実エンジンで描画する。[ソースモデル](../../02_Architecture/input-assistance-source-model.md)の範囲評価順序（住所検証→寸法→カード判定→実体化）を共有し、編集中の巨大範囲でエディタを止めない。
- 候補の提示は貼り付けと同じ画面規約に合わせる（[出所設計](../../02_Architecture/input-assistance-paste-provenance.md)§7）。作成・編集・貼り付けで別々のUIを作らない。
- 未知キーと繰返しキーを保持したまま対象項目だけを更新する方法を、パーサーの往復で検証する。
