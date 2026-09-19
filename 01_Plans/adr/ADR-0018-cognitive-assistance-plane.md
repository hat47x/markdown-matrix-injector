# ADR-0018: Cognitive Assistance Plane — 認知は助言し、決定論的コアが権威を持つ

- Status: Accepted
- Date: 2026-09-19
- Related: ADR-0012, ADR-0016, ADR-0017, requirements.md Phase 5 / Phase 11 / Phase 12 / Phase 13
- Supersedes: なし

## 背景

MMIはADR-0012で、Excel等を便利に閲覧するツールではなく、正本表データとMarkdown文書の間に**宣言的・読み取り専用・検証可能なガバナンス境界**を置く仕組みへ再定義した。

ADR-0017とissue-0114〜0134では、既知書式の候補抽出・逸脱検出に対し、FlyHash風の疎表現、winner-take-all、novelty / ambiguity、worksheet snapshot、source profile、実XLSX境界を段階的に評価してきた。通常のparser・resolver・rendererへ認知処理を混入させず、誤採用時にはfail-closedする方針を維持している。

一方、MMIには「決定論だけでは扱いにくいが、汎用LLMへ全面委譲する必要もない」判断が存在する。Jev等のSystem One型モデル、Fly-inspired matcher、ローカルLLM / 汎用LLMは異なる種類の認知を担いうるが、一つの「AI機能」として混ぜるとconfidenceの意味、責務、外部通信、再現性、失敗時挙動が曖昧になる。

## 決定

### D1. Authority PlaneとCognitive Assistance Planeを分離する

parser、resolver、query semantics、containment、Read-only保証、diagnostics、rendering、conformance判定を**Authority Plane**とする。認知技術はその外側の**Cognitive Assistance Plane**へ置く。

Cognitive Assistance Planeは候補、判断、説明、提案を返せるが、正本変更、Notation意味変更、containment / Read-only判定、diagnostics事実、conformance判定を上書きできない。同じNotationと正本に対し、認知機能ON/OFFで論理表やAuthority Planeの診断結果が変化してはならない。

### D2. 認知を4層の責務として扱う

1. **Authority — deterministic core**: 事実、規約、パス解決、構文、検証、描画。
2. **Perception — local sparse cognition**: Fly-inspired matcher等による類似候補、novelty、逸脱、候補順位。
3. **Judgment — typed bounded decision**: Jev等による閉集合分類、レビュー経路、意図カテゴリ等の原子的判断。
4. **Reasoning / Generation — generative model**: LLMによる説明、自然言語からの候補生成、未定義パターンの草案。

これは4種類の実装を必須とするものではなく、providerが担う責務と出力の性質を明示する境界である。

### D3. 認知入力はDerived Cognitive Stateとする

認知providerへは、可能な限り正本そのものではなく、Authority Planeまたはread-only adapterから再生成できる**Derived Cognitive State**を渡す。

少なくとも observation kind / schema version、source profile / feature version、再生成可能な抽象featureまたは限定メタデータ、source digest、provenanceを保持できる構造とする。セル値は明示的に許可された場合のみ限定的に含める。正本へのwrite handleを持たせない。

### D4. provider-neutralなCognitive Contractを設ける

Fly、Jev、LLMを直接相互依存させず、共通契約を介して接続する。最低限、provider identity / version、capability kind、input schema version、signal kind、candidate / judgment / proposal、abstention / unavailable / error、provider固有confidence、evidence / reason code、provenanceを区別する。

**異なるproviderのconfidenceは同じ確率尺度とみなさない。** Fly matcherの類似度、Jev等の確率、LLM由来の自己評価値を単純平均・最大値選択・共通閾値へ押し込まない。

### D5. abstentionを正常系にする

`novel`、`ambiguous`、`abstained`、`unavailable`、`unsupported`を、既知候補への強制変換理由にしない。provider障害、モデル不在、ネットワーク不通、timeout時もAuthority Planeと通常入力支援を継続する。

### D6. Format Profileを明示的な設計資産として扱う

worksheet format prototypeは、将来的に**Format Profile**として明示的・版管理可能な設計資産へ昇格できる。隠れたオンライン学習状態にはしない。

更新は「read-only観測から候補生成 → 差分とevidence提示 → 人間承認 → 明示ファイルとしてversion controlへ保存 → 以後の比較に利用」を原則とする。認知providerが自動的にprototypeを学習・更新してはならない。

### D7. 認知結果は再検証してから適用する

Jev / LLM等がNotation候補を直接または間接に生成した場合、適用前に既存parser、schema / known parameter catalog、resolver、containment check、source existence check、preview / deterministic evaluationを必ず通す。認知出力をAuthority Planeの検証代替にしない。

### D8. privacy / networkは明示opt-inとする

ローカルで完結できる認知はローカルを優先する。外部providerへの送信は明示opt-inとし、MMIが自動的に有料クラウドや別providerへfallbackしてはならない。既定ではfeature・候補ID・必要なメタデータを中心にし、セル値本文や機密情報を暗黙送信しない。

### D9. MMI Notation v1のconformanceを変更しない

Cognitive Assistance Planeは参照実装側の補助能力であり、MMI Notation v1のL0〜L3準拠条件には含めない。認知providerが存在しない実装も完全な準拠実装になり得る。AI固有構文をv1コアへ追加しない。

### D10. 初期実装順を固定する

1. provider-neutral Cognitive Contract
2. 既存Fly-inspired matcherのPerception provider化
3. Format Profile資産境界
4. Jev等のclosed-choice Judgment provider feasibility
5. provenance / review UIとの統合

Jev接続を先に行わず、provider交換・停止・不在でもAuthority Planeが不変である契約を先に固定する。

## 受け入れるトレードオフ

- 自動適用より操作は1段増えるが、監査可能性とRead-only境界を維持できる。
- provider間confidenceを共通尺度に正規化しないため「総合AIスコア」は作りにくいが、異なる意味の数字を誤合成しない。
- Format Profile更新に人間承認を要求するため完全自律学習は行わないが、組織の設計書構造をversion control可能な資産として残せる。
- Cognitive Assistance PlaneをNotation conformanceから外すことで、規約の普遍性を守る。

## 現行worksheet-format研究との関係

ADR-0017は本ADRに置き換えず、**Perception層の具体的安全境界**として継続する。`worksheet-format-v6`、current flat matcher、`minConfidence=0.7`、`minWinnerMargin=0.05`、source-profile一致必須、同一adapterからのprototype生成を維持する。

issue-0134で確認したとおりfillは補助evidenceとして維持するがweightを増やさない。multi-family / fill telemetryは十分な実データ証拠が揃うまでproduction accept/rejectへ昇格させない。

## Follow-up Actions

- issue-0135: provider-neutral Cognitive Contract foundation
- issue-0136: Fly-inspired matcherをPerception providerへ適合
- issue-0137: Format Profileのversioned asset boundary
- issue-0138: Jev等のclosed-choice Judgment provider feasibility

## 議事録 (AI読込不要)

Architecture LeadはAuthority Planeの不変性、Product/UX Leadは決定論的事実と認知提案の表示上の分離、QA/Delivery Leadはabstentionとfail-closed、Security/Governanceは外部providerのopt-inとhidden learning禁止を重視した。

結論は、MMIの価値を「AI化」ではなく、決定論的ガバナンス境界の周囲に交換可能で非権威的な認知補助を置くことに定めた。
