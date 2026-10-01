# Issue: 既存AIへの依頼文準備と候補のローカル検証

## Meta
- Type: Feature
- Status: Open
- Priority: High
- Scope: src/dx（依頼文/提案検査）, test, docs
- Expected verification level: manual-e2e

## Traceability
- Related Requirement: requirements.md「執筆支援」「公開品質」
- Related ADR/Spec: ADR-0016-notation-first-input-assistance.md, 04_Documentation/spec/mmi-notation-v1.md
- Dependency: issue-0193（Candidate / provenance契約）。外部LLMそのものには依存しない

## Execution Plan
### Proposed solution
ADR-0018 D11 / ADR-0019 D15の「外部LLMへ作業提案と判断材料を渡す」経路を実装する。MMIは外部サービスを呼ばず、ローカルにhandoff packageを生成する。利用者または外部AIエージェントがそれを使い、戻された提案は既存Authority Planeで検証する。

### Acceptance criteria
- [ ] Candidate、source locator、provenance、diagnostics、利用者の目的から、外部LLMへ渡せる依頼文とevidence packageをローカル生成する。
- [ ] packageには「確定事実」「推定候補」「未解決事項」「期待する作業」「MMIで再検証すべき出力」を分けて含める。
- [ ] source本文・セル値・画像等を含める場合は、何を外部LLMへ渡す材料に含めたか利用者が確認できる。既定では必要最小限とする。
- [ ] MMIから外部サービスへ通信しない。APIキー、自動ログイン、課金型providerの設定を要求しない。
- [ ] 戻された候補に対して構文・実在性・境界・プレビューをAuthority Planeで検証し、確認前に文書へ適用しない。
- [ ] AIの命令文、存在しないシート、未対応集計、URL/外部パス、巨大応答を拒否または非対応として案内する。
- [ ] CLI / JSON経路からもhandoff packageを生成でき、特定のAI製品の専用形式だけにしない。

### Validation plan
既存のビルド・単体・Extension Hostを回帰検査する。新しい動作は実VS Codeで確認し、候補選択・キャンセル・Undo・原本ハッシュと通信範囲を記録する。測定値を取得するまでは性能やAI品質の目標を達成済みとしない。

## Remaining work

- issue-0193のCandidate / provenance JSONを入力として使い、handoff独自の候補モデルを作らない。
- 依頼文に含めるメタデータ・セル値・画像等の範囲を用途別に定める。機密情報を自動で広げない。
- 戻された候補の検証は既存のparser / resolver / containment / source existence / previewを使い、独自の緩い検証を作らない。
- 最初の縦切りは「曖昧なExcel Candidateについて外部LLMへ判断を依頼するpackage」とし、特定LLMとのAPI統合は行わない。
