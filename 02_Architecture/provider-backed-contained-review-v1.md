# Provider-backed Contained Unified Review v1

## 1. 目的

contained source（アクセス範囲を制限して扱う原本）から得たPerception（観測に基づく認識結果）を、provider-neutral closed-choice Judgment（提供元に依存しない、選択肢を限定した判断候補）へ渡し、その結果を既存の4-domain review model（4領域のレビュー表現）へ統合する。

```text
stable contained snapshot
   |
   +--> Fly Perception
   |
   v
derived review-route Observation
   |
closed-choice provider port
   |
proposal-only Judgment
   |
Cognitive Review Envelope
   |
same transient snapshot
   |
Profile-backed deterministic review + Authority
   |
UnifiedHumanReviewViewModelV1
```

## 2. Derived Judgment Observation

provider（判断処理の提供元）へは、source Observation（原本から得た観測情報）をそのまま渡さない。

providerへ渡す派生payload（必要な項目を抽出したデータ）は、次のとおり。
- kind = worksheet-format-review-route
- sheetName
- classification
- candidateIds
- optional winnerPrototypeId
- noveltyScore

次の情報は派生payloadに含めない。
- cells
- merges
- raw features
- absolute source path
- source bytes
- WorkbookData

provenance（観測の出所・版を示す情報）には、source ObservationのsourceKind/sourceDigest/featureVersion/sourceProfileIdを引き継ぐ。

## 3. Why a separate Observation

Judgment providerへ渡す情報の範囲を、Perception APIやWorksheet snapshot（ワークシートの観測記録）が将来拡張されても独立して保てるようにする。

「providerへ渡せるderived state（観測情報から必要な項目だけを取り出した状態）」を明示的な型として定める。これにより、Observation payloadに将来raw情報（加工前の情報）が追加されても、そのまま外部providerへ渡ることを防ぐ。

## 4. External opt-in

provider invocation（提供元への呼び出し）は、issue-0161の`runClosedChoiceJudgmentProvider`を必ず経由する。

external-opt-in provider（外部呼び出しに明示的な許可が必要な提供元）は、`allowExternalJudgment=true`が指定されている場合に限って呼び出す。

## 5. Failure ordering

```text
Profile preflight
 -> stable snapshot read
 -> Perception
 -> derived Judgment Observation
 -> provider
 -> Envelope
 -> deterministic binding
 -> Authority Workbook load
```

providerが拒否した場合、呼び出しに失敗した場合、またはinvalid response（形式の不正な応答）だった場合は、Authority loader（原本を検証のために読み込む処理）へ進まない。

## 6. Source changes during provider wait

stable read window（同じ原本状態を読み取る期間）が終了した後、provider call（提供元の処理を待つ時間）中にsource（原本）が変わる可能性はある。

workflow（処理の流れ）は、provider callの間、filesystem lock（ファイルへの操作を排他的に制限する仕組み）を保持しない。
代わりにAuthority側で、Envelope（レビュー結果をまとめる情報）のsourceDigest（原本内容を識別するdigest）と現在のsource bytes（原本のバイト列）を再照合する。

原本の変化が確認された場合、最終modelのAuthority結果は`blocked(source-identity)`となる。

Cognitive/Deterministic（認知処理／決定的処理）の結果は、以前のstable source state（安定して読み取った時点の原本状態）に対する記述として保持し、内容を改変しない。

## 7. Provider-specific projection

Jev adapterなどでは、派生Observation（観測から作った限定的な情報）をさらに明示的な`projectState`で投影し、provider transport（提供元への通信を担う経路）へ渡す。

このため、外部への情報の絞り込みは次の二段階になる。

```text
raw worksheet
 -> MMI derived review-route Observation
 -> provider-specific state projection
 -> external request
```

## 8. 非責務

- live Jev transport
- credentials
- retry
- provider selection policy
- threshold routing
- auto accept/reject
- apply authority
- UI
