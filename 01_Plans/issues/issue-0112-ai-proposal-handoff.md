# Issue: 既存AIへの依頼文準備と候補のローカル検証

## Meta
- Type: Feature
- Status: Draft
- Priority: Medium
- Scope: src/dx（依頼文/提案検査）, test, docs
- Expected verification level: manual-e2e

## Traceability
- Related Requirement: requirements.md「執筆支援」「公開品質」
- Related ADR/Spec: ADR-0016-notation-first-input-assistance.md, 04_Documentation/spec/mmi-notation-v1.md
- Dependency: 主経路外の任意タスク。issue-0115の評価後に必要性を再判断

## Execution Plan
### Proposed solution
[入力支援企画](../input-assistance-proposal.md)の該当範囲を1件ずつ実施する。今回は企画のみで未着手。ADRの提案を具体化してからOpenへ変更する。

### Acceptance criteria
- [ ] 文法・選択済みメタデータ・利用者の目的から依頼文を作り、送信前に利用者が内容を確認できる。MMIから外部へ通信しない。
- [ ] 戻された候補に対して構文・実在性・境界・プレビューを検証し、確認前に文書へ適用しない。
- [ ] AIの命令文、存在しないシート、未対応集計、URL/外部パス、巨大応答を拒否または非対応として案内する。
- [ ] 任意サービスへの自動ログイン・セッション流用・送信をせず、サービス側の費用保証ではないことをUIに説明する。

### Validation plan
既存のビルド・単体・Extension Hostを回帰検査する。新しい動作は実VS Codeで確認し、候補選択・キャンセル・Undo・原本ハッシュと通信範囲を記録する。測定値を取得するまでは性能やAI品質の目標を達成済みとしない。

## Remaining work

主経路外の任意タスク。[issue-0115](issue-0115-cpu-range-search.md)の評価後に必要性を再判断する。CPU探索で十分な精度が出れば本Issueは不要になり得る。

着手する場合の未解決事項。

- 依頼文に含めるメタデータの範囲。原本のセル値をどこまで載せるかは利用者の確認を要する。
- 戻された候補の検証は[クリップボード出所と照合](../../02_Architecture/input-assistance-paste-provenance.md)§4と同じ照合契約を使う。独自の緩い検証を作らない。
