# Issue: 追加API課金を伴わないローカル認知runtime / model providerを評価する

## Meta
- Type: Evaluation / Feature design
- Status: Draft
- Priority: Medium
- Scope: Cognitive Assistance Planeのlocal runtime discovery、bounded decision / generative provider、評価fixture、evidence
- Expected verification level: manual-e2e

## Traceability
- Related Requirement: requirements.md「認知支援」「AI・認知技術との3経路」「認知資産の配布」
- Related ADR/Spec: ADR-0018 D2・D4・D8・D11、ADR-0020 D2・D7・D10
- Dependency: provider-neutral Cognitive Contract（issue-0135）はDone。Candidate側の利用箇所はissue-0193以降で具体化する

## 背景

MMI内部の認知は、外部API課金を前提にしない。決定論的規則、Fly-inspired matcher、Jev類似のbounded model、ローカルLLM等から、要件に最も単純で十分な方式を選ぶ。

model-basedなM3/M4が必要な場合も、MMI専用runtimeを先に抱えず、Ollama等の導入済みlocal runtimeと既存model cacheを再利用できるかを評価する。runtime不在なら機能を無効化し、Authority Planeを継続する。

2026-09-29にOllama 0.35がJev API由来のtyped decision model向け `/v1/systemone` を追加しており、同一runtimeでM3 bounded Judgmentを試せる。通常のlocal model APIはM4候補になり得るため、MMI側はruntime固有APIを直接各機能へ埋め込まずprovider adapterへ閉じ込める。

## Acceptance criteria

- [ ] 再開時には、model-based方式を必要とする具体的なCandidate / Structuralizer / review / explanationタスクと、M0〜M2では不足する証拠を先に記録する。
- [ ] local runtime discoveryの契約を定める。少なくとも「明示設定されたendpoint」→「localhostの既知runtime」の順とし、LANや外部hostを勝手に探索しない。
- [ ] Ollama等が導入済みの場合、利用可能なruntime version / model / capabilityを列挙し、MMIのM3 / M4 capabilityへ写像できる。
- [ ] runtimeやmodelが存在しない場合に、自動install・自動pull・cloud fallbackを行わない。
- [ ] 既存model/cacheを再利用し、同じweightをMMI側へ重複downloadしない。MMI管理artifactが必要な場合はissue-0204のmanifest/cache契約を使う。
- [ ] providerはADR-0018のCognitive Contractに従い、Authority Planeへ直接接続しない。
- [ ] M3 bounded decisionとM4 generative reasoningを別capabilityとして扱い、同じruntimeだからという理由で混同しない。
- [ ] Windows / Linuxの少なくとも一方でネット遮断下のlocal inferenceを確認し、外部通信・外部API課金を生じない。
- [ ] model不在、メモリ不足、timeout、unsupported時は `abstained` / `unavailable` とし、基本機能を継続する。
- [ ] source全文を無条件に渡さず、Derived Cognitive Stateまたは限定された抜粋を入力とする。
- [ ] model、量子化、license、artifact size、disk usage、memory、初回load、通常latency、CPU/GPU使用量を記録し、同じタスクのM0〜M2方式と比較する。
- [ ] 採用してもMMI Notation conformanceや基本機能の必須依存にしない。

## Validation plan

具体的タスクごとに、決定論的規則 / Fly等の既存方式とlocal runtime providerを同じfixtureで比較する。Ollamaが利用可能な環境では、M3はtyped decision API、M4はlocal generative APIを別々に測定する。正常、曖昧、unsupported、悪意ある入力を含め、誤った自動適用0件を必須とする。ネットワーク遮断状態でもlocal経路が成立することを確認する。

## Remaining work

- Ollamaは最初のruntime候補であり必須依存ではない。他のlocal runtimeも同じdiscovery/provider契約で比較可能にする。
- Ollamaのmodel自動pullは行わない。既存modelで不足し、追加modelが有用な場合は、サイズ・license・用途を示して利用者が明示的に取得する。
- M0〜M2で十分な要件では本Issueを使わない。
