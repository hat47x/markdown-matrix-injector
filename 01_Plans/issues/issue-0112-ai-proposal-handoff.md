# Issue: 外部LLMへ作業提案と判断材料を渡し、戻り提案をローカル検証する

## Meta
- Type: Feature
- Status: Open
- Priority: High
- Scope: src/dx / src/cli（handoff package）、test、docs、skills/mmi
- Expected verification level: manual-e2e

## Traceability
- Related Requirement: requirements.md「AI・認知技術との3経路」「執筆支援」「公開品質」
- Related ADR/Spec: ADR-0018 D7・D8・D11、ADR-0019 D10・D11、MMI Notation v1
- Dependency: 基本経路は既存CLIとCognitive Contractで着手可能。Candidateを含むpackageはissue-0193に依存

## 背景

MMI自身が課金を要する生成AIサービスを呼ぶことは原則としない。一方、利用者が選んだChatGPT、Claude、Codex等の外部LLM / AIエージェントはMMIの第一級利用者である。

外部LLMとの関係は、(1) 外部LLMがMMIのCLI・skill・将来のMCP等を呼ぶ経路と、(2) MMIが曖昧なCandidate、診断、source locator、provenance等から**作業依頼と判断材料をローカルに生成し、利用者側のLLMへ手渡す経路**に分ける。本Issueは後者を扱う。送信、サービス選択、API key、課金はMMIの責務にしない。

## Acceptance criteria

- [ ] MMIが、未解決診断・Candidate・source locator・provenance・必要最小限の抜粋から、外部LLMへ渡せる機械可読なevidence packageをローカル生成できる。
- [ ] packageには「依頼したい作業」「確定事実」「推定候補」「未解決事項」「許可される操作」「禁止される操作」を分離して含める。
- [ ] 人向けには、そのpackageから自然言語の作業提案 / promptを生成できる。promptは成果物ではなく、利用者が選んだLLMへの手渡し用とする。
- [ ] source本文やセル値は既定で最小限とし、値を含める場合は明示操作にする。秘密情報を暗黙に全文投入しない。
- [ ] MMI自身は外部LLMへ送信せず、API key・課金アカウント・自動ログイン・自動クラウドfallbackを持たない。
- [ ] 外部LLMから戻されたMMI記法・Candidate選択・変換案は、parser / schema / resolver / containment / source existence / preview等のAuthority Planeで再検証する。
- [ ] 戻り提案が存在しないシート、未対応集計、URL/外部パス、任意コマンド実行等を要求する場合は拒否または非対応として扱う。
- [ ] 外部LLMが利用できなくても、MMIのinspect / check / render / extractとローカル認知は継続する。

## Validation plan

架空のExcel設計書について、(a) unresolved diagnostic、(b) ambiguous Candidate、(c) source変更後の要確認箇所の3ケースでhandoff packageとpromptを生成する。生成時にネットワーク通信が無いことを確認する。戻り提案は正常・誤ったsheet・ワークスペース外path・未対応集計を含むfixtureでAuthority Planeの再検証を通し、誤提案が自動適用されないことを確認する。

## Remaining work

- CLI名はCandidate契約と合わせて決める。例: `mmi handoff` / `mmi propose`。コマンド名を先に固定しない。
- 将来MCPを追加する場合も、このpackage契約を再利用し、MCPだけの独自判断ロジックを作らない。
- provider固有のprompt最適化はコアに入れない。必要なら外部skill / template側で行う。
