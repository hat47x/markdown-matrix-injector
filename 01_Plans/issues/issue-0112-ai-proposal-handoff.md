# Issue: 既存AIへの依頼文準備と候補のローカル検証

## Meta
- Type: Feature
- Status: Draft
- Priority: Medium
- Scope: src/dx（依頼文/提案検査）, test, docs
- Expected verification level: manual-e2e

## Traceability
- Related Backlog/Phase: requirements.md Phase 5 / Phase 11
- Related ADR/Spec: ADR-0016-notation-first-input-assistance.md, 04_Documentation/spec/mmi-notation-v1.md
- Dependency: issue-0111完了

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
