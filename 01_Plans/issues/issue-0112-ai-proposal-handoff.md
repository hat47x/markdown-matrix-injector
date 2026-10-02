# Issue: 外部LLMへ作業提案と判断材料を渡し、戻り提案をローカル検証する

## Meta
- Type: Feature
- Status: In Progress
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

- [x] MMIが、未解決診断・Candidate・source locator・provenance・必要最小限の抜粋から、外部LLMへ渡せる機械可読なevidence packageをローカル生成できる。
- [x] packageには「依頼したい作業」「確定事実」「推定候補」「未解決事項」「許可される操作」「禁止される操作」を分離して含める。
- [x] 人向けには、そのpackageから自然言語の作業提案 / promptを生成できる。promptは成果物ではなく、利用者が選んだLLMへの手渡し用とする。
- [x] source本文やセル値は既定で最小限とし、値を含める場合は明示操作にする。秘密情報を暗黙に全文投入しない。
- [x] MMI自身は外部LLMへ送信せず、API key・課金アカウント・自動ログイン・自動クラウドfallbackを持たない。
- [ ] 外部LLMから戻されたMMI記法・Candidate選択・変換案は、parser / schema / resolver / containment / source existence / preview等のAuthority Planeで再検証する。
- [ ] 戻り提案が存在しないシート、未対応集計、URL/外部パス、任意コマンド実行等を要求する場合は拒否または非対応として扱う。
- [ ] 外部LLMが利用できなくても、MMIのinspect / check / render / extractとローカル認知は継続する。


## Implementation checkpoint (2026-10-02)

`src/dx/aiHandoff.ts` に `mmi.ai-handoff/v1` を追加した。Semantic Candidateを無加工で外へ渡さず、Claimを認識論上の状態に沿って `confirmedFacts`（`observed / confirmed`）、`inferredCandidates`（`inferred`）、`unresolvedIssues`（`abstained`と既存MMI診断）へ分離する。各項目にはsource locator、source digest、Candidate fingerprint、method/execution、provenanceを保持する。

privacyの既定値は `sourceValues: omitted` / `evidenceDetails: omitted` とし、Claimの`value`とEvidenceの`detail`はpackageにもpromptにも載せない。`--include-values`を明示した場合だけ含める。fingerprintやprovenanceは保持するが、原本セル本文を全文抜粋する経路は作らない。

CLIは `mmi handoff <source> --task <text>` とした。既定出力は人が外部LLMへ手渡すための自然言語prompt、`--json`は同じ情報の機械可読package、`--document <doc.md>`は既存`check`相当の未解決診断を追加する。sourceとdocumentは`--root`配下に限定し、realpath後もworkspace外なら読み込み前に拒否する。コマンド自身はHTTP client、provider SDK、API key、認証、cloud fallbackを持たず、送信処理も行わない。

packageには許可操作（MMI記法の提案、Candidate選択理由の説明、利用者レビューの提案）と禁止操作（原本/ワークスペース変更、任意コマンド、network access、workspace外読取、推定の権威化、未検証提案の確定扱い）を固定し、戻り値は`proposalOnly: true` / `authorityRevalidationRequired: true`とする。

`test/aiHandoff.test.ts` では、既定packageからClaim値・Evidence詳細が消えること、明示opt-in時だけ復元されること、診断の同梱、promptのAuthority境界、空task/不正Candidate拒否、source重複排除、CLI経由のprivacy、workspace containmentを固定した。

戻り提案の適用経路はまだ本Issueへ接続していない。既存`experimental/authorityRevalidationAdapter.ts`にはMMI記法提案に対する parser → parameter schema → resolver → containment → source existence → read-only preview とsource identity再確認があるため、次段はこの経路を再利用し、handoff専用の第二Authority実装を作らない。

## Validation plan

架空のExcel設計書について、(a) unresolved diagnostic、(b) ambiguous Candidate、(c) source変更後の要確認箇所の3ケースでhandoff packageとpromptを生成する。生成時にネットワーク通信が無いことを確認する。戻り提案は正常・誤ったsheet・ワークスペース外path・未対応集計を含むfixtureでAuthority Planeの再検証を通し、誤提案が自動適用されないことを確認する。

## Remaining work

- CLI名は最小縦切りで`mmi handoff`に固定した。戻り提案の検証CLI/API名はAuthority経路との接続時に決める。
- 将来MCPを追加する場合も、このpackage契約を再利用し、MCPだけの独自判断ロジックを作らない。
- provider固有のprompt最適化はコアに入れない。必要なら外部skill / template側で行う。
