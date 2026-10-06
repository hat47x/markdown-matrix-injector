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

## 再開の前提（2026-10-07、[ADR-0023](../adr/ADR-0023-fuzzy-search-before-paraphrase-and-model-runtime.md)・提案）

言い換え検索だけを理由に、ローカルのモデル実行環境を導入させない。需要は未観測で、あいまい検索（略語・表記ゆれ）のほうが先である。本Issueを再開するのは、M0〜M2で足りない具体的なタスクが検索の言い換え以外にも記録され、利用者がすでに実行環境を持ち、新しい未見セットで決定論の方式に対する改善が測定されたときとする。既定オフの実験的な埋め込み経路（issue-0115）は拡張しない。

## 背景

MMI内部の認知は、外部API課金を前提にしない。決定論的規則、Fly-inspired matcher、Jev類似のbounded model、ローカルLLM等から、要件に最も単純で十分な方式を選ぶ。

model-basedなM3/M4が必要な場合も、MMI専用runtimeを先に抱えず、Ollama、LM Studio等の導入済みlocal runtimeと既存model cacheを再利用できるかを評価する。runtime不在なら機能を無効化し、Authority Planeを継続する。

2026-10-01時点で、Ollamaはtyped decision系を含むlocal APIを持ち、LM Studioはlocalhost上のOpenAI互換API・独自REST APIとmodel inventory/load管理を持つ。M3 bounded JudgmentとM4 generative reasoningを異なるcapabilityとして比較し、MMI側はruntime固有APIを直接各機能へ埋め込まずprovider adapterへ閉じ込める。

## Acceptance criteria

- [ ] 再開時には、model-based方式を必要とする具体的なCandidate / Structuralizer / review / explanationタスクと、M0〜M2では不足する証拠を先に記録する。
- [ ] local runtime discoveryの契約を定める。少なくとも「明示設定されたendpoint」→「localhostの既知runtime」の順とし、LANや外部hostを勝手に探索しない。
- [ ] Ollama、LM Studio等が導入済みの場合、利用可能なruntime version / model / capabilityを列挙し、MMIのM3 / M4 capabilityへ写像できる。
- [ ] OpenAI互換local endpointで共通化できるinference経路と、Ollama / LM Studio等のruntime固有管理APIを分離する。
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

具体的タスクごとに、決定論的規則 / Fly等の既存方式とlocal runtime providerを同じfixtureで比較する。Ollamaが利用可能な環境ではtyped decisionとlocal generativeを別々に測定し、LM Studioが利用可能な環境ではOpenAI互換inferenceとmodel inventory/load経路を測定する。正常、曖昧、unsupported、悪意ある入力を含め、誤った自動適用0件を必須とする。ネットワーク遮断状態でもlocal経路が成立することを確認する。

## Remaining work

- Ollama / LM Studioはいずれもruntime候補であり必須依存ではない。他のlocal runtimeも同じdiscovery/provider契約で比較可能にする。
- runtime固有のmodel自動pull/downloadは行わない。既存modelで不足し、追加modelが有用な場合は、サイズ・license・用途を示して利用者が明示的に取得する。
- M0〜M2で十分な要件では本Issueを使わない。
