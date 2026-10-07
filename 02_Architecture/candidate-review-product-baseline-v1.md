# Candidate review product baseline v1

Status: evaluation contract / product promotion gate

Related:

- GitHub issue #218 — structured artifact intelligence pilot
- `candidateReviewObservation.ts`
- `MMI-PV-BASELINE-01`

## 1. Purpose

Learned rankingや構造候補のaccuracyが上がっても、MMIを使う人の確認作業が減らなければ、Product pathへ入れる理由にはなりません。

このcontractは、現在のCandidate reviewがすでに記録しているcontent-free observationを集計し、

> 現行のdeterministic product pathと比べて、支援機能が同じ仕事を少ない確認・修正で終えられたか

を比較します。

新しいTelemetry収集系は作りません。

## 2. Comparison unit

最初の比較は次の二条件です。

```text
A: current-product-baseline
   current deterministic discovery + current review lifecycle

B: assisted
   A + learned ranking / proposal / other candidate assistance
```

AとBで、import transaction、source authority、review decision、UI lifecycleを別物にしません。

比較には同じ`fixtureCohort`、同じ`protocolId`、同じsession数を要求します。さらにProduct CLIは、対応する各sessionについてsource digest、ledger filter、review facetが一致することを内部で確認します。文字列上のcohort名が同じだけでは比較可能とみなしません。

source digestは比較の同一性確認にだけ使い、baseline reportへコピーしません。別の原本や別のreview filterを使った結果を、モデル効果として比較しません。

## 3. Existing observationを再利用する

入力は`mmi.candidate-review-observation/v2`です。

Product baselineが集計する値は次です。

- session数
- review経過時間
- review対象として選ばれたCandidate数
- review state transition数
- accepted / modified / rejected / deferred transition
- newly imported Candidate数
- Markdown編集を中断して開始したsessionのproxy
- table / image altのmodified item数
- table / image altのchanged-span character数

Source label、Source digest、Candidate identity、range、reviewed textはbaseline reportへコピーしません。

そのため、Product baselineのために顧客文書本文を新しいログへ複製しません。

## 4. Work metricを一つのscoreへ畳まない

v1では、次を個別の値として比較します。

- `durationMs`
- `selectedCandidates`
- `reviewStateTransitions`
- `editingInterruptionSessions`
- `modifiedItems`
- `changedSpanCharacters`
- `newlyImported`

「時間が30%減ったので、修正量が倍でも総合点では改善」のような合成scoreは使いません。

Product promotionの最初のpolicyは保守的にします。

- A/Bで同じsource bytesとreview filter/facetを使う
- `newlyImported`を減らさない
- lower-is-betterの各work metricを悪化させない
- 少なくとも一つのwork metricを改善する

このpolicyは統計的有意差を主張するものではありません。Product pathへ進める前の最低Gateです。

## 5. Safety / authorityは非相殺

次はwork metricと相殺しません。

- source mutation
- failed import後のdraft / asset / ledger残留
- changed contentへのacceptance誤継承
- inferred Candidateのobservedへの昇格
- workspace escape

各conditionは、この5項目を明示的な整数countとして持ちます。

一件でも違反があれば、作業時間がどれほど減っても`promotion.eligible=false`です。

また、countを単に0と書くだけではProduct promotionに使いません。`evidenceRefs`を最低一件要求します。

`evidenceRefs`は署名やAuthorityではありません。どのtest/report/run artifactでcountを得たかを後から辿るためのprovenanceです。

## 6. Missing measurementを0にしない

観測が無い値を「改善なし」や「コスト0」とみなしません。

Candidateが一件も選択されていない場合、

- duration / Candidate
- transition / Candidate

は`null`です。

modified itemが0件の場合、changed-span / modified itemも`null`です。

これにより「測れなかった条件」が最も効率的に見えることを防ぎます。

## 7. CLI

既存observation JSONLとSafety Evidence JSONを比較できます。

```bash
cd 03_Implement

npm run eval:product-baseline -- \
  --baseline artifacts/baseline-observations.jsonl \
  --assisted artifacts/assisted-observations.jsonl \
  --baseline-safety artifacts/baseline-safety.json \
  --assisted-safety artifacts/assisted-safety.json \
  --cohort sier-practical-v1 \
  --protocol mmi-pv-baseline-01 \
  --assisted-id learned-ranking-v1 \
  --out artifacts/product-baseline.json
```

Safety Evidenceの最小shapeは次です。

```json
{
  "counts": {
    "sourceMutation": 0,
    "failedImportResidue": 0,
    "staleAcceptanceInheritance": 0,
    "inferredToObservedPromotion": 0,
    "workspaceEscape": 0
  },
  "evidenceRefs": [
    "test:practical-source-byte-identity",
    "test:transactional-import-rollback"
  ]
}
```

5項目のどれかが欠けたSafety JSONはfail closedです。

## 8. What this does not prove

`promotion.eligible=true`でも、次は証明していません。

- learned modelの一般的な優越
- 統計的有意差
- 未観測業務へのgeneralization
- Candidateが業務上正しいこと
- Sourceに書かれていない意味の真実性
- provider/modelのAuthority
- human acceptanceの代替

これは、同じProduct protocol上で「少なくとも悪化させずに仕事量を減らせた」ことを確認するGateです。

## 9. Research relation

MMI-R1では、read-onlyでprovenance-preservingな構造Projectionを介すことが、workbookを直接扱うagentよりtarget-region誤認、context量、更新追従を改善するかを研究します。

このProduct baselineは、その研究結果を製品へ昇格させる際の別軸です。

```text
research evaluation
  structural / model capability
        +
product baseline
  actual review burden / safety
        ↓
product promotion decision
```

offline accuracyだけでProduct採用を決めません。
