# ADR-0021: Candidateと認知結果のライフサイクル・再現性・レビュー状態を分離する

- Status: Accepted
- Date: 2026-10-01
- Amended: 2026-10-03（Issue #417。実行時Candidateから認識論上の`confirmed`を除き、採用状態へ分離）
- Deciders: Human Sponsor、MMI Lead Agent
- Scope: Candidate contract、Import Ledger、Cognitive Assistance、Review UI、local runtime、external LLM handoff、CLI / CI
- Related: [ADR-0018](ADR-0018-cognitive-assistance-plane.md)、[ADR-0020](ADR-0020-requirement-oriented-cognition-method-selection.md)

## Context

ADR-0020で、認知方式と決定論性を要件ごとに選ぶ方針を定めた。初期のSemantic Candidate契約v1では、表・画像について `observed / inferred / confirmed / abstained`、`deterministic / provider-dependent`、M0〜M5を保持していた。

次の実装段階では、取り込み台帳、CandidateレビューUI、provider-dependentな認知、ローカルruntime再利用へ進む。この段階では、単に「候補を出す」だけでなく、候補がいつ有効か、原本やmodelが変わったらどう失効するか、複数方式が異なる結論を返したとき何をするか、利用者の採否をどう扱うかを定義する必要がある。

特にCandidate v1の `confirmed` は、「情報をどう知ったか」という認識論上の状態と、「利用者が採用したか」というレビュー状態を同じ軸に置いている。人が推定候補を採用しても、その推定が原本に明示された事実へ変わるわけではない。

## Decision

### D1. 認識論上の状態とレビュー状態を分離する

長期契約では次の軸を分ける。

**Epistemic state**
- `observed`: 原形式に明示された事実
- `inferred`: 規則・類似・分類・model等から推定された内容
- `abstained`: 方式が主張を控えた状態

**Review state**
- `unreviewed`
- `accepted`
- `rejected`
- `modified`
- `deferred`

2026-10-03のIssue #417適用以後、実行時Candidateの `EpistemicStatus` から `confirmed` を除外する。新しいSource Adapter、CLI、レビューUIは `confirmed` を認識論上の値として生成・表示しない。既存の `mmi.ledger/v1` に保存された `confirmed` は読み取り互換のため受理するが、新規記録は `accepted` とする。これは採用状態の語彙移行であり、元の `observed` / `inferred` を変更しない。

### D2. 人の承認は永続的な真実ではなく、根拠に紐づく決定とする

review recordは少なくとも次を持つ。

- decision
- candidate / claim reference
- source basis digest
- evidence digest
- algorithm/provider/model/artifact version
- reviewer type（human / deterministic verification）
- reviewedAt
- optional note

sourceや根拠が変わった場合、過去のreview recordは履歴として保持するが、現在のCandidateに対しては `stale` と判定できるようにする。

### D3. Candidateの同一性を一つのIDへ潰さない

少なくとも次を分離する。

1. **Occurrence identity:** 現在のsource上の出現場所。ファイル、sheet、object/range locator。
2. **Content identity:** 内容のfingerprint/digest。同一内容を異なる位置で再利用しても一致し得る。
3. **Lineage / reconciliation evidence:** source更新後に「以前のCandidateと同じものか」を判断するための証拠。locator、fingerprint、近傍、object id等を使う。

同じ画像バイト列が2か所に置かれている場合、content identityは同じでもoccurrenceは別である。取り込み台帳は両者を区別し、完全一致だからという理由だけで一方のsemantic roleを他方へ継承しない。

### D4. 鮮度をClaim単位で判定できるようにする

source file全体のdigestだけでなく、可能な場合はClaimが依存する局所的なevidence digestを持つ。

例は次のとおりです。
- 画像bytesのClaim → media digest
- anchorのClaim → drawing anchorのdigest
- 表内容 → normalized cell digest
- 近接関係 → 両Candidateのlocator + geometry config digest
- provider-dependent分類 → input evidence digest + provider/model/artifact/parameters

無関係なsheetが変わっただけで全Candidateをstaleにしない。一方、根拠が変わったClaimは再評価対象にする。

### D5. 複数方式の競合を「統合confidence」で消さない

異なるalgorithm/providerが異なる結果を返した場合、数値を平均して単一の答えへ潰さない。

- M0 observed factは、推定方式が上書きしない。
- inferred同士の不一致はalternative proposalとして保持する。
- 同じprovider/scale内の順位は使ってよいが、異なるscaleのscoreを直接比較しない。
- 自動選択が必要な機能では、明示された決定論的policyを別途定める。
- policyで安全に決められない場合は `conflicted` または `abstained` としてレビューへ回す。

### D6. provider/runtimeの自動選択と再現性を分離する

対話利用ではOllama、LM Studio等の導入済みruntimeを探索して候補提示してよい。一方、provider-dependentな結果を再利用・CI・共有する場合は、実行環境を固定できる情報を残す。

最低限は次のとおりです。
- provider type
- endpoint class（localhost / explicit remote）
- runtime version
- model identifier
- artifact digestまたは取得可能な同等identity
- parameters
- capability
- input evidence digest

`auto` provider選択は探索・対話用途に限定し、CIや再現性が必要な処理でsilent provider switchをしない。artifact digestが取得できないruntimeでは、再現性を `best-effort` と明示する。

### D7. 再現性をbinaryな属性だけで扱わない

`deterministic / provider-dependent` は実行モデルの大分類として維持するが、実測上の再現性scopeも記録できるようにする。

- `exact`: canonical outputがbyte-equivalent
- `semantic`: Claim/valueは同一だが、順序・floating representation等の非意味差を許す
- `best-effort`: provider/runtime依存で完全再現を保証しない

Go / TinyGo / WASM / OS差のconformanceでは、どのscopeを要求するかをfixtureごとに明示する。

### D8. provider-dependent処理には資源予算と取消しを持たせる

人の作業を止めないため、local model/runtime処理は通常編集の同期クリティカルパスに置かない。

最低限は次のとおりです。
- timeout
- cancellation
- max concurrency
- optional CPU / memory / GPU budget
- input digestが変わったrunの結果破棄
- model auto-load禁止または明示許可
- background / review時の実行優先

入力が更新された後に古い推論結果が戻っても現在のCandidateへ適用しない。

### D9. 採否履歴を自動オンライン学習へ直結させない

accepted / rejected / modifiedは価値ある教師データになり得るが、利用者の操作だけでmodelや閾値を暗黙更新しない。

- feedbackはproject-localな観測として記録できる。
- training/evaluation corpusへのexportは明示操作にする。
- 個人情報・顧客情報の除去方針を別途適用する。
- model/profile更新はversioned artifactとして行い、既存runの再現性を壊さない。

### D10. 外部LLM handoffは根拠versionへ結び付ける

handoff packageは少なくとも次を持つ。

- package id
- package digest
- source / evidence digest
- Candidate / Claim references
- generatedAt
- requested operation
- allowed / forbidden operations

外部LLMから戻る提案はpackage id/digestへ結び付け、source/evidenceが変わっていたらそのまま適用せず再生成または再検証する。

### D11. Artifact trustとruntime trustを別に扱う

model weightをdigest検証しても、そのmodelを実行するruntime自体が信頼できるとは限らない。

- artifact trust: digest、license、source、optional signature
- runtime trust: localhostか、明示endpointか、runtime/version/capability
- data exposure: sourceのどの範囲をprocess境界へ渡したか

localhostは「ネットワーク外部ではない」が「MMI Coreと同じtrust domain」とはみなさない。必要最小限のDerived Cognitive Stateだけを渡す原則を維持する。

## Consequences

### Good
- 人の採用と原本事実を混同しない。
- source/model更新時のstale判定と再レビューが設計できる。
- 同一内容の複数配置、移動、差し替えを台帳で正しく扱いやすい。
- 複数providerの競合を隠さず表現できる。
- local runtime再利用とCI再現性を両立できる。
- model inferenceが編集操作を重くすることを構造的に防げる。
- 将来のGo/TinyGo/WASM差を「deterministicか否か」だけで誤分類しない。

### Bad
- Candidate contract v1からreview stateを分離する移行が必要になる。
- ledger / UI / handoff / runtime adapterのmetadataが増える。
- provider-dependentな結果を完全再現できないケースを明示的に扱う必要がある。

## Traceability

- Related Issues:
  - issue-0195 import ledger
  - issue-0202 Candidate review UI
  - issue-0203 portable core
  - issue-0204 cognitive artifact distribution
  - issue-0112 external LLM handoff
  - issue-0113 local cognition runtime
- Related Docs:
  - [Semantic Candidate契約 v1](../../02_Architecture/candidate-contract-v1.md)
  - [製品要求](../../00_Prompt/requirements.md)
