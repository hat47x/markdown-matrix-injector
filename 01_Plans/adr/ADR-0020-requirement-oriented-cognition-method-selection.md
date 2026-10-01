# ADR-0020: 要件ごとに認知方式を選択し、決定論性を実行モデルの境界にする

- Status: Accepted
- Date: 2026-10-01
- Deciders: Human Sponsor、MMI Lead Agent
- Scope: Product requirements、Authority Plane、Cognitive Assistance Plane、Candidate / Structuralizer、Excel解析、CLI / IDE / Agent integration
- Related: [ADR-0018](ADR-0018-cognitive-assistance-plane.md)、[ADR-0019](ADR-0019-ai-era-sier-document-value-and-policy.md)、[製品要求](../../00_Prompt/requirements.md)

## Context

MMIは、表参照に加えて画像、図形、レイアウト、ツリー、リスト、注記等を扱うモダナイズ基盤へ広がっている。これらの要求には、原形式から明示的に取得できる事実、決定論的な規則・幾何・グラフ処理で十分な推定、類似検索が向く判断、閉集合分類が向く判断、自由度の高い意味解釈が必要な判断が混在する。

認知機能をFly / Jev / LLM等の製品名やモデル種別から設計すると、解くべき問題より技術が先に立つ。逆に「認知=機械学習」と狭く捉えると、連結成分、区間重なり、グラフ探索、番号体系、インデント、テンプレート照合、統計的閾値等の安価で説明可能なアルゴリズムを見落とす。

MMIでは、**認知的に見える処理であっても、決定論的アルゴリズムが最善ならそれを選ぶ**。また、決定論的に再現できる推定が原本事実になるわけではない。認識論上の確度と実行時の決定論性を分離して扱う。

## Decision

### D1. 認知方式を広く定義する

要件を実現する候補を、特定モデルではなく次の方式群として比較する。

| ID | 方式 | 例 | 主な特徴 |
| --- | --- | --- | --- |
| M0 | 明示構造の決定論的抽出 | parser、OOXML relation、JSON/XML tree、Data Validation、hash | 原形式が持つ事実を取得 |
| M1 | 決定論的推定アルゴリズム | 幾何、グラフ探索、連結成分、interval、番号・indent規則、テンプレート照合、統計的閾値 | 再現可能で軽量だが結果は推定になり得る |
| M2 | 軽量類似・疎表現 | FlyHash、MinHash、局所特徴、nearest-neighbor、novelty | CPUで大量候補を絞る。実装により決定論的にもprovider-dependentにもなり得る |
| M3 | bounded Judgment | Jev類似技術、small classifier、closed-choice decision | 選択肢が有限な意味判断 |
| M4 | local generative reasoning | ローカルLLM、小型生成モデル | 局所的な曖昧構造、説明、候補生成 |
| M5 | external LLM handoff | prompt / evidence package | 利用者が選んだ外部LLMへ委譲。MMI自身は送信しない |

M0〜M4は実装候補、M5は外部委譲境界である。単一要件で複数方式を直列・並列に使ってよい。

### D2. 最も単純で十分な方式を優先する

方式選定では、原則として次の順に検討する。

1. 原形式に明示された情報をM0で取得できないか。
2. 幾何・グラフ・規則・統計的アルゴリズムM1で十分でないか。
3. 大量候補の絞込み・類似判定ならM2が適切でないか。
4. 選択肢が有限ならM3へ閉じられないか。
5. 自由度の高い局所解釈が必要な場合だけM4を評価する。
6. 利用者が外部LLMへ委譲する価値がある場合、M5用のevidenceを生成する。

これは必ず順番に実行するfallback chainではない。要件ごとに最適な方式を選ぶための検討順序であり、不要な層は実行しない。

### D3. 認識論上の状態と決定論性を直交させる

Candidateは少なくとも2軸を持つ。

**認識論上の状態**
- `observed`: 原形式に明示された事実。
- `inferred`: 規則、幾何、類似、分類、LLM等から推定した結果。
- `confirmed`: 人またはAuthority Planeの明示的照合で採用が確定した結果。
- `abstained`: 十分な根拠がなく確定しない結果。

**実行特性**
- `deterministic`: 同じ入力・設定・実装versionから同じ結果が得られる。
- `provider-dependent`: model、provider、sampling、runtime等により結果が変化し得る。

例えば「画像anchor」はOOXML relationから読めれば `observed + deterministic`、「この画像は直上表の説明図」は固定した幾何規則で判定しても `inferred + deterministic` である。ローカルLLMによる用途分類は通常 `inferred + provider-dependent` になる。

**deterministicであることだけを理由にAuthority事実へ昇格させない。**

### D4. 決定論性をアプリケーション実行モデルへ反映する

決定論的経路とprovider-dependent経路は、UIだけでなく実行構造を分ける。

| 項目 | deterministic path | provider-dependent path |
| --- | --- | --- |
| 主用途 | Authority処理、決定論的推定 | 認知補助、意味判断、説明 |
| 実行 | 同期または通常ジョブとして可 | 原則非同期・任意 |
| 編集操作への影響 | latency基準を満たせば直接利用可 | 編集をブロックしない |
| cache key | input digest + config + implementation version | 左記 + provider/model/version/parameters |
| CI | 必須検証に利用可 | 必須合否の唯一根拠にしない |
| conformance | golden fixtureで完全一致を要求可能 | schema / invariant / acceptance rangeを中心に検証 |
| retry | 同条件なら意味を持たない | provider failure時のみ。結果改善目的の無限再試行は禁止 |
| auto apply | Authority仕様に属する処理のみ可 | 原則proposal-only |
| unavailable時 | 機能要件なら可視エラー | abstained / unavailableとして基本機能継続 |
| provenance | algorithm/version/reason | provider/model/version/parameters/evidenceも保持 |

この分離により、VS Code、CLI、将来のGo Core / WASMでも同じApplication APIを使いながら、provider-dependentな認知処理を主トランザクションから外せる。

### D5. 要件ごとの第一候補を定める

| 要件 / Candidate | 第一候補 | 補助候補 | 外部LLM handoffが有効な場合 |
| --- | --- | --- | --- |
| Table / Range | M0セル構造 + M1領域分割 | M2類似検索、M3種別判定 | 非定型表の意味説明 |
| Image / Screenshot | M0 OOXML relation / media / anchor | M1近接・重なり、M2画像fingerprint、M3用途分類 | 画像内容の説明が必要な場合 |
| Sheet / Region snapshot | M1幾何・領域分割 | M2既知レイアウト類似、M3採否 | 説明対象範囲が曖昧な場合 |
| Shape / Text box | M0 OOXML object / text / anchor | M1空間関係、M3役割分類 | 自由記述の意味解釈 |
| Diagram | M0 connector relation + M1 graph | M2 motif類似、M3図種分類 | 図の業務意味を文章化する場合 |
| Tree / Hierarchy | M0 JSON/XML parent-child、M1 indent/番号/親列 | M2 hierarchy pattern、M3関係種別 | 自由文の階層が曖昧な場合 |
| Choice list / List | M0 Data Validation、M1箇条書き規則 | M3選択肢種別 | 暗黙の選択肢を説明する場合 |
| Note / Comment | M0 comment metadata | M1近接関連、M3用途分類 | 注記の要約・作業提案 |
| Link | M0 hyperlink relation | M1参照先分類 | 壊れた参照の修復案 |
| Section | M0 heading metadata、M1番号・layout | M2類似、M3章種別 | 非定型文書の区画説明 |
| 重複回避 | M0 digest / exact fingerprint | M2 perceptual / semantic similarity | 近似候補の差分説明 |
| provenance | M0のみ | なし | evidence packageの説明生成だけ可 |
| check / containment / Read-only | M0のみ | なし | 修復案提示は可、判定代替は不可 |
| materialize / detach check | M0を正本 | M1で不足候補の探索可 | 人向け移行作業案の生成 |
| Candidateレビュー優先度 | M1規則 | M2 novelty / similarity、M3 route分類 | 大量候補のレビュー計画 |
| 外部LLM handoff | M0 provenance + M1〜M4のevidence | M5 | この要件自体がhandoff経路 |

この表は実装済みを意味しない。各Issueは該当方式をfixtureで比較し、採用方式を記録する。

### D6. 認知方式の比較軸を固定する

方式選定では最低限、次を比較する。

- correctness / recall / false positive
- abstentionできるか
- deterministic / provider-dependent
- observed / inferredのどちらを生成するか
- evidenceを説明できるか
- CPU、memory、latency
- binary size / runtime dependency
- model / profile artifact size、download、disk cache、更新差分
- training dataまたはprofile管理の必要性
- source全文を必要とするか
- privacy / network dependency
- native / WASM portability
- implementation / maintenance cost
- provider / vendor lock-in
- failure時に基本機能を継続できるか

### D7. 学習・認知機能は要件単位で採用する

「MMIにJevを入れる」「LLMを入れる」のような横断導入を行わない。例えばJev類似技術を採用する場合でも、「Candidate review routeのclosed-choice分類でM1/M2より有利」という要件単位の証拠を必要とする。

Fly-inspired方式、ローカルLLM、将来の別の認知技術も同様とする。技術そのものを製品要件にしない。

### D8. 外部LLMは比較対象の最後ではなく別経路とする

M5は「M4でも解けないから自動fallbackする先」ではない。利用者が外部LLMを使いたい作業について、MMIが十分なevidence packageを作るための境界である。MMI自身は課金型LLMへ送信しない。

### D9. 認知資産をCoreから分離する

認知方式の評価には、実行コードだけでなくmodel weight、prototype、index、embedding、profile、training/evaluation metadata等の**認知資産**のサイズと配布コストを含める。

- 小さい規則、schema、Format Profile等はCoreまたは通常の配布物へ同梱してよい。
- 大きなmodel weightや再生成コストの高いindexはCore binaryへ埋め込まず、独立artifactとして扱う。
- artifactは少なくとも `artifact id / kind / version / digest / byte size / license / source URI / compatible provider / schema version` をmanifestで識別する。
- 初回起動時に暗黙で大型modelを取得しない。必要な機能を利用者が有効化した時点で、取得サイズと取得元を示せるようにする。
- download後はdigestを検証し、ローカルcacheを再利用する。offline時は既存cacheを使い、無ければ `unavailable` として基本機能を継続する。
- GitHub repository本体を大型modelの唯一の保存先にしない。GitHub Releases / LFS、model hub、object storage等を交換可能なartifact sourceとして扱う。
- 外部model repositoryを利用しても、実行時にそのサービスへ推論要求を送ることとは分離する。モデルをローカル取得してオフライン推論する経路を維持できる。
- source URIが消失しても、digestとlicense、互換versionをmanifestから追跡できるようにする。

認知方式の比較では、model / profile artifactの**download size、disk cache size、更新差分、cold availability、offline usability**も評価する。小型モデルで十分な要件では、大型モデルの精度向上だけを理由に標準依存へ昇格させない。

### D10. 導入済みローカルruntimeを優先的に再利用する

M3 / M4相当のmodel実行が必要な場合、MMI専用runtimeやmodelを先に配布せず、Ollama等の**既に導入済みのローカルmodel runtime**を発見して再利用できるかを先に評価する。

- runtime discoveryは任意で、未導入でもMMIの基本機能を壊さない。
- runtimeが存在しても勝手にmodelをpullしない。利用可能model、capability、disk size等を確認し、利用者の明示操作なしに大型artifactを追加しない。
- runtimeが保持する既存model/cacheを再利用できる場合、MMI独自cacheへ重複downloadしない。
- provider adapterはruntime固有APIをCognitive Contractへ写像し、CoreのAuthority Planeへ直接依存させない。
- 同一runtimeがbounded decisionとgenerative reasoningの双方を提供しても、M3とM4のcapabilityを区別する。
- localhost以外のruntime endpointは外部通信として扱い、明示設定なしに探索・接続しない。
- runtime不在、model不在、version不一致は `unavailable` として扱い、自動的に課金型cloudへ切り替えない。

2026-09-29時点のOllama 0.35はJev API由来のtyped decision向け `/v1/systemone` をローカル提供しており、M3の実装候補になり得る。これはOllamaを必須依存にする決定ではなく、既存runtime再利用の有効性を評価する具体例として扱う。

## Consequences

### Good

- 決定論的アルゴリズムを認知処理の正式な候補として扱える。
- 技術ありきではなく、要件とfixtureから方式を選べる。
- `deterministic inferred`を正しく表現できる。
- provider-dependent処理を編集・CIの主経路から分離できる。
- Go / TinyGo / WASM化でもpure deterministic coreを切り出しやすい。
- Fly/Jev/LLM等を交換可能な実装候補として維持できる。

### Bad

- Candidate metadataとテスト軸が増える。
- 同じ要件について複数方式を比較する評価作業が必要になる。
- provider-dependent結果ではgolden outputの完全一致テストだけでは足りない。

## Traceability

- Related Issues:
  - [issue-0193](../issues/issue-0193-candidate-source-adapter-contract.md)
  - [issue-0194](../issues/issue-0194-excel-image-candidates.md)
  - [issue-0199](../issues/issue-0199-tree-structured-source-adapters.md)
  - [issue-0202](../issues/issue-0202-candidate-review-ui.md)
  - [issue-0203](../issues/issue-0203-portable-core-minimum-binary.md)
  - [issue-0204](../issues/issue-0204-cognitive-artifact-distribution.md)
- Related Docs:
  - [製品要求](../../00_Prompt/requirements.md)
  - [製品価値と現行実装のギャップ](../product-gap-analysis.md)
