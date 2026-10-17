# Candidate review product baseline v1

Status: evaluation contract / product promotion gate

Related:

- GitHub issue #218 — structured artifact intelligence pilot
- `candidateReviewObservation.ts`
- `MMI-PV-BASELINE-01`

## 1. Purpose

Learned ranking（学習による候補の順位付け）や構造候補のaccuracy（正確さ）が向上しても、MMIを使う人の確認作業が減らなければ、Product path（製品で使う処理経路）へ取り入れる理由にはなりません。

このcontract（比較条件を定めた契約）では、現在のCandidate review（候補を人が確認する作業）がすでに記録しているcontent-free observation（文書本文を含まない観測記録）を集計します。比較する観点は次のとおりです。

> 現行のdeterministic product pathと比べて、支援機能が同じ仕事を少ない確認・修正で終えられたか

新しいTelemetry（利用時の観測情報）の収集系は作りません。

## 2. Comparison unit

最初に、次の2条件を比較します。

```text
A: current-product-baseline
   current deterministic discovery + current review lifecycle

B: assisted
   A + learned ranking / proposal / other candidate assistance
```

AとBで、import transaction（取り込み処理のまとまり）、source authority（どの原本を判断のよりどころとするかという位置づけ）、review decision（人による確認判断）、UI lifecycle（画面操作の流れ）を別物にはしません。

比較には、同じ`fixtureCohort`（評価対象群）、同じ`protocolId`（評価手順の識別子）、同じsession数を要求します。さらにProduct CLI（比較を実行するコマンドライン処理）は、対応する各sessionについてsource digest（原本内容の照合値）、ledger filter（台帳上の絞り込み条件）、review facet（レビュー対象の区分）が一致することを内部で確認します。cohort名の文字列が一致するだけでは、比較可能とはみなしません。

source digestは比較対象の同一性を確認するためだけに使い、baseline report（基準側の比較結果）へはコピーしません。別の原本や別のreview filter（レビュー時の絞り込み条件）を使った結果を、モデルの効果として比較しません。

## 3. Existing observationを再利用する

入力には、既存の観測データ契約である`mmi.candidate-review-observation/v2`を使います。

Product baseline（現行製品を基準とした比較）では、次の値を集計します。

- session数
- review経過時間
- review対象として選ばれたCandidate数
- review state transition数
- accepted / modified / rejected / deferred transition
- newly imported Candidate数
- Markdown編集を中断して開始したsessionのproxy
- table / image altのmodified item数
- table / image altのchanged-span character数

Source label（原本の表示名）、Source digest、Candidate identity（候補の識別情報）、range（参照範囲）、reviewed text（レビューした本文）はbaseline reportへコピーしません。

そのため、Product baselineのために顧客文書本文を新しいログへ複製しません。

## 4. Work metricを一つのscoreへ畳まない

v1では、work metric（確認・修正にかかる作業負担の指標）を一つのscore（総合点）にはまとめず、次の値を個別に比較します。

- `durationMs`
- `selectedCandidates`
- `reviewStateTransitions`
- `editingInterruptionSessions`
- `modifiedItems`
- `changedSpanCharacters`
- `newlyImported`

「時間が30%減ったので、修正量が倍でも総合点では改善」のような合成scoreは使いません。

Product promotion（支援機能を製品へ採用する判断）に使う最初のpolicy（判断方針）は、保守的な条件とします。

- A/Bで同じsource bytesとreview filter/facetを使う
- `newlyImported`を減らさない
- lower-is-betterの各work metricを悪化させない
- 少なくとも一つのwork metricを改善する

このpolicyは統計的有意差を示すものではありません。Product pathへ進める前の最低Gate（判定条件）です。

## 5. Safety / authorityは非相殺

次の安全性や、原本と判断結果の信頼境界に関する違反は、work metricの改善によって相殺しません。

- source mutation
- failed import後のdraft / asset / ledger残留
- changed contentへのacceptance誤継承
- inferred Candidateのobservedへの昇格
- workspace escape

各condition（比較条件）は、この5項目について、それぞれ明示的な整数count（件数）を持ちます。

一件でも違反があれば、作業時間がどれほど減っても`promotion.eligible=false`です。

また、countを単に0と記載するだけではProduct promotionに使いません。`evidenceRefs`（件数の根拠への参照）を最低1件要求します。

`evidenceRefs`は署名やAuthorityではありません。どのtest/report/run artifact（試験・報告・実行の成果物）でcountを得たかを後から辿るためのprovenance（出典情報）です。

## 6. Missing measurementを0にしない

観測できなかった値を、「改善なし」や「コスト0」とはみなしません。

Candidateが1件も選択されていない場合、次の値は`null`です。

- duration / Candidate
- transition / Candidate

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

Safety Evidence（安全性違反の件数と根拠をまとめたデータ）の最小shape（データ構造）は次のとおりです。

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

5項目のどれかが欠けたSafety JSONは、fail closed（安全側として処理を認めない扱い）です。

## 8. What this does not prove

`promotion.eligible=true`でも、次の事項を証明したことにはなりません。

- learned modelの一般的な優越
- 統計的有意差
- 未観測業務へのgeneralization
- Candidateが業務上正しいこと
- Sourceに書かれていない意味の真実性
- provider/modelのAuthority
- human acceptanceの代替

これは、同じProduct protocol上で「少なくとも悪化させずに仕事量を減らせた」ことを確認するGateです。

## 9. Research relation

MMI-R1では、read-only（原本を書き換えない方式）でprovenance-preserving（出典を保持する方式）な構造Projection（構造を取り出して提示する表現）を介することで、workbookを直接扱うagent（自動処理の主体）よりtarget-region（対象範囲）の誤認、context量（渡す情報量）、更新追従が改善するかを研究します。

このProduct baselineは、研究結果を製品として採用するか判断する際の、別の評価軸です。

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
