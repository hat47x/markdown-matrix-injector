# Issue: 追加API課金を伴わないローカルLLM providerの実現性を評価する

## Meta
- Type: Evaluation / Feature design
- Status: Draft
- Priority: Low
- Scope: Cognitive Assistance Planeのローカルgenerative provider、評価fixture、evidence
- Expected verification level: manual-e2e

## Traceability
- Related Requirement: requirements.md「認知支援」「AI・認知技術との3経路」
- Related ADR/Spec: ADR-0018 D2・D4・D8・D11
- Dependency: provider-neutral Cognitive Contract（issue-0135）はDone。Fly / Jev系の軽量providerを先に利用し、ローカルLLMが必要な具体的タスクを特定してから再開する

## 背景

MMI内部の認知は、外部API課金を前提にしない。優先するのは決定論的規則、Fly-inspired matcher、Jev類似のbounded model等の軽量なローカル処理である。

ローカルLLMも第2経路「MMI内部の軽量・ローカル認知」の候補になり得るが、汎用的な推論器として常時起動したり、Fly / Jev / 規則の失敗時に自動fallbackしたりしない。**具体的な解析タスクで、より軽い方式では不足すると観測された場合にだけ評価する交換可能なprovider**として扱う。

## Acceptance criteria

- [ ] 再開時には、ローカルLLMを必要とする具体的なCandidate / Structuralizer / explanationタスクと、規則・Fly・bounded Judgmentでは不足する証拠を先に記録する。
- [ ] providerはADR-0018のCognitive Contractに従い、Authority Planeへ直接接続しない。
- [ ] Windows / Linuxの少なくとも一方の一般的なCPU環境で、ネット遮断下でも動作し、外部通信・外部API課金を生じない。
- [ ] モデル不在、メモリ不足、timeout、unsupported時はabstain / unavailableとして処理し、別の有料providerへ自動切替しない。
- [ ] source全文を無条件に渡さず、Derived Cognitive Stateまたは限定された抜粋を入力とする。
- [ ] 生成結果を事実として扱わず、Candidate / proposalとして返し、適用前にAuthority Planeで再検証する。
- [ ] モデル、量子化、ライセンス、メモリ、初回ロード、通常応答時間、CPU使用量を記録し、同じタスクの非LLM方式と比較する。
- [ ] 採用してもMMI Notation conformanceや基本機能の必須依存にしない。

## Validation plan

再開条件を満たす具体的タスクについて、規則 / Fly等の既存方式と同じfixtureで比較する。正常、曖昧、unsupported、悪意ある入力を含め、誤った自動適用0件を必須とする。ネットワークを遮断した状態で同じ評価を実行する。

## Remaining work

**現時点では保留。** 「CPU探索の精度が低いからLLMへ切り替える」という理由だけでは再開しない。issue-0193以降でCandidate / Structuralizerの実利用を進め、規則・Fly・Jev類似技術で扱いにくい具体的な意味判断が観測された時点で再評価する。
