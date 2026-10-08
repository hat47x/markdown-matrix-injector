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
- [x] 外部LLMから戻されたMMI記法・Candidate選択・変換案は、parser / schema / resolver / containment / source existence / preview等のAuthority Planeで再検証する。MMI記法は既存preview Authority chain、Candidate選択はhandoff allowlist、変換案はcurrent sourceから再発見したCandidateと既存Linked/Extracted経路へ束縛し、いずれも自動適用しない。
- [x] 戻り提案が存在しないシート、未対応集計、URL/外部パス、任意コマンド実行等を要求する場合は拒否または非対応として扱う。
- [x] 外部LLMが利用できなくても、MMIのinspect / check / render / extractとローカル認知は継続する。


## Implementation checkpoint (2026-10-02)

`src/dx/aiHandoff.ts` に `mmi.ai-handoff/v1` を追加した。Semantic Candidateを無加工で外へ渡さず、Claimを由来に沿って分離する。`confirmedFacts`には原本から直接得た`observed`だけを置き、`inferredCandidates`には`inferred`とCandidate v1互換の`confirmed`を置く。`confirmed`は採用済み表現であり、Source factへ昇格したとは扱わない。`unresolvedIssues`には`abstained`と既存MMI診断を置く。各項目にはsource locator、source digest、Candidate fingerprint、method/execution、provenanceを保持する。

privacyの既定値は `sourceValues: omitted` / `evidenceDetails: omitted` とし、Claimの`value`とEvidenceの`detail`はpackageにもpromptにも載せない。`--include-values`を明示した場合だけ含める。fingerprintやprovenanceは保持するが、原本セル本文を全文抜粋する経路は作らない。人向けpromptにはCandidate identityを値と分離して表示し、Candidate選択案と変換案がsource値なしでも同じ候補を指せるようにした。

CLIは `mmi handoff <source> --task <text>` とした。既定出力は人が外部LLMへ手渡すための自然言語prompt、`--json`は同じ情報の機械可読package、`--document <doc.md>`は既存`check`相当の未解決診断を追加する。sourceとdocumentは`--root`配下に限定し、realpath後もworkspace外なら読み込み前に拒否する。コマンド自身はHTTP client、provider SDK、API key、認証、cloud fallbackを持たず、送信処理も行わない。

packageには許可操作（MMI記法の提案、Candidate選択理由の説明、利用者レビューの提案）と禁止操作（原本/ワークスペース変更、任意コマンド、network access、workspace外読取、推定の権威化、未検証提案の確定扱い）を固定し、戻り値は`proposalOnly: true` / `authorityRevalidationRequired: true`とする。

`test/aiHandoff.test.ts` では、既定packageからClaim値・Evidence詳細が消えること、明示opt-in時だけ復元されること、診断の同梱、promptのAuthority境界、空task/不正Candidate拒否、source重複排除、CLI経由のprivacy、workspace containmentを固定した。

戻り提案の適用経路はまだ本Issueへ接続していない。既存`experimental/authorityRevalidationAdapter.ts`にはMMI記法提案に対する parser → parameter schema → resolver → containment → source existence → read-only preview とsource identity再確認があるため、次段はこの経路を再利用し、handoff専用の第二Authority実装を作らない。

### MMI記法の戻り検証（2026-10-02）

`src/dx/aiHandoffProposalValidation.ts` と `mmi validate-proposal` を追加し、外部LLMから戻った**MMI記法1件**を自動適用せずローカル再検証できるようにした。検証順序は、handoff package Authority契約 → 単一MMI embed parser → strict parameter schema → handoff source allowlist → 既存document diagnostics（resolver / containment / source existence / sheet existence）→ source digest一致 → 既存`evaluateEmbed`によるread-only preview → preview後source digest再確認、である。

通常MMIでは未知parameterを互換用に無視できるが、外部LLMの戻り提案ではfail-closedとし、`aggregate=sum`等の未知parameterは`PROPOSAL_UNSUPPORTED_PARAMETER`で拒否する。存在しないsheetはcard modeでもdiagnostics段で拒否する。packageに無いsource、URL、workspace外pathはsource allowlist/containmentで拒否し、自由文・任意コマンドは単一MMI embedとしてparseできないため拒否する。sourceがhandoff後に変わった場合もpreview前に拒否し、preview中の変更は前後digest差分で拒否する。

validation receiptは `mmi.ai-handoff-proposal-validation/v1` とし、各checkを`passed / failed / not-run`で保持する。CLIは全check通過時のみexit 0、blockedはexit 1、入力不足/境界外package・documentはexit 2とする。receiptは提案のdigestだけを保持し、自動適用・原本変更は行わない。

`test/aiHandoffProposalValidation.test.ts`では正常提案、誤sheet、URL/外部path、未対応集計parameter、任意コマンド/自由文、source変更、package Authority契約改変、operation境界拡張、CLI exit code/workspace containmentを回帰として固定した。

Candidate選択案については次の縦切りを追加した。handoff内のCandidateにはsource値を含めずにoccurrence/contentへ結び付く `candidateIdentity` を付与し、外部AIはそのidentityだけを選択案として返す。`validateAiHandoffCandidateSelection` は、返されたidentityが実際にhandoffへ提示されていたかをallowlist照合し、未知・捏造Candidateをblockedにする。選択案のschemaにはepistemic statusを書き換える欄を持たせず、成功状態も `accepted-for-review` として、AI選択をAuthorityへ昇格させない。receipt digestはnested proposal全体をcanonical化して束縛する。

Candidate選択proposalはtop-levelとCandidate identityのfieldを固定し、余分な`status`、`command`、`outputPath`等をfail-closedで拒否する。validation receiptのdigestはproposal全体を再帰的にcanonical化して計算し、ネストしたCandidate identityの変更も束縛する。

### 変換案の戻り検証（2026-10-02）

`src/dx/aiHandoffTransformationValidation.ts` に `mmi.ai-handoff-transformation-proposal/v1` と `mmi.ai-handoff-transformation-validation/v1` を追加した。外部AIが指定できるのはhandoffに含まれた`candidateIdentity`、希望する到達状態（`linked` / `extracted`）、rationale、未解決事項だけである。出力先、コマンド、conversion実装、MMI記法そのものを外部AIに指定させない。未知fieldを含むproposalはfail-closedで拒否する。

validatorはsourceをworkspace境界内で再解決してdigestを照合し、Candidateレビューと同じ目録生成器を使ってcurrent sourceからCandidateを再発見する。表・画像だけでなく、Shape、Choice list、明示Tree、フラットテキストTreeも同じ入口から再確認する。occurrence/content identityとalgorithm/runtime provenanceがhandoff時点と一致しない場合はblockedとする。source変更・Candidate消失・adapter/runtime basis変更後の古いproposalは、新しいhandoffを要求する。

`linked`ではcurrent Candidateのローカル`reference`だけを使い、既存`validateAiHandoffNotationProposal`のparser、parameter schema、source allowlist、diagnostics、source identity、read-only previewを再度通す。`extracted`では、表は`gfm-table-v1`、画像は`raw-image-bytes-v1`、JSON/YAML/XML Treeは各`*-nested-list-v1`、フラットテキストTreeは`flat-text-nested-list-v1`の既存経路だけをreview planとして返す。ShapeやChoice list等、直接のExtracted経路を持たないCandidateは、存在を再確認したうえで未対応変換としてblockedにする。validator自身はfileを書かず、成功状態も`accepted-for-review`であり、自動適用やAuthority確定を意味しない。フラットテキストTreeが`inferred + M1`であることも変更しない。

CLIには`validate-selection <proposal.json>`と`validate-transformation <proposal.json>`を追加した。handoff packageとproposal JSONはworkspace内に限定する。`validate-transformation`はreference baseとなるMarkdownもworkspace内に限定する。全検証を通過した場合だけexit 0とし、blockedはexit 1、入力不備や境界外fileはexit 2とする。

これによりMMI記法・Candidate選択・変換案の3種類すべてを、外部AIの返答をそのままAuthorityへ昇格させずにローカル再検証できる。実装上の受入条件は満たしたが、IssueのExpected verification levelであるmanual-e2eはまだ実施していない。

## Validation plan

架空のExcel設計書について、(a) unresolved diagnostic、(b) ambiguous Candidate、(c) source変更後の要確認箇所の3ケースでhandoff packageとpromptを生成する。生成時にネットワーク通信が無いことを確認する。戻り提案は正常・誤ったsheet・ワークスペース外path・未対応集計を含むfixtureでAuthority Planeの再検証を通し、誤提案が自動適用されないことを確認する。

## Remaining work

- `mmi handoff`、`validate-proposal`、`validate-selection`、`validate-transformation`を実装済み。変換検証はCandidateレビューと同じ再発見入口を使い、表・画像・JSON/YAML/XML/フラットテキストTreeの既存変換をreview planへ束縛する。残る主要作業は架空Excel設計書を使ったmanual-e2eと、必要に応じた実務データでの観測である。
- 将来MCPを追加する場合も、このpackage契約を再利用し、MCPだけの独自判断ロジックを作らない。
- provider固有のprompt最適化はコアに入れない。必要なら外部skill / template側で行う。
