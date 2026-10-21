# Jev Choice Judgment Adapter v1

## 1. 目的

Jev Choice（選択肢から回答するJevの機能）を、MMIのprovider-neutral（提供元に依存しない）Closed-choice Judgment port（限定された選択肢の判断結果を受け取る接続口）へ接続する。

このadapter（接続先との形式変換を担う部品）自体はnetwork client（通信処理の本体）ではない。

```text
MMI Cognitive Observation
   |
   v
explicit state projector
   |
   v
Jev Choice request
   |
transport port
   |
Jev Choice response
   |
   v
ClosedChoiceProviderResponse
   |
issue-0161 runner
   |
issue-0138 adaptClosedChoiceResponse
   |
proposal-only Judgment
```

## 2. 公式HTTP contract

2026-09-20時点に参照したTypeSafe公式docsでは、System One APIの入口は次のとおり。

```text
POST https://api.typesafe.ai/v1/systemone
```

request:
- state: string | object | array
- model: string
- questions: map

Choice:
- type = choice
- instructions
- criteria: option -> string|null

response:
- answers[questionId].type = choice
- choice
- probabilities
- confidence

当時の参照先は次のとおり。
- https://docs.typesafe.ai/api
- https://docs.typesafe.ai/primitives/choice

## 3. Transport injection

adapterは次のtransport（通信を委譲する接続口）にのみ依存する。

```ts
interface JevSystemOneTransport {
  evaluate(request: JevSystemOneChoiceRequest): Promise<unknown>
}
```

transport責務:
- endpoint
- Authorization
- timeout
- retry
- HTTP status mapping

adapter責務:
- request shape
- response shape
- MMI provider mapping

この分離により、unit test（部品単位の試験）では実際のnetwork通信を必要としない。

## 4. Explicit state projection

Observation（MMI側で観測した情報）を、そのままJevへ送信しない。

callerが:

```ts
projectState(observation)
```

を明示する。

review（人による確認）の用途では、raw worksheet（元のワークシート全体）ではなくderived state（必要な情報だけを取り出した状態）を投影できる。

## 5. Choice criteria

callerは各choiceについて:

```ts
describeChoice(choice, question)
```

を提供する。

nullも許容するが、暗黙生成はしない。

## 6. Choice cardinality

参照時点の公式docsに記載されたChoiceの上限255に合わせ、次の範囲で扱う。

- 2未満: existing question contractで拒否
- 256以上: Jev adapterで拒否

する。

## 7. State validation

Jevへ渡すstate（状態データ）は、JSON-compatible（JSONとして表現できる）な次の型に限定する。
- string
- object
- array

に限定する。

拒否は次のとおりです。
- undefined
- function
- symbol
- bigint
- NaN / Infinity
- cyclic reference
- Date / class instance等のnon-plain object

transportへ渡す前に検証する。

## 8. Response mapping

transportのresponse（返答）は型が未確定のunknownとして受け取り、shape（データの構造）を検証する。

必要となる項目は次のとおり。
- model: non-empty string
- answers.decision
- type = choice
- choice: string
- probabilities: object
- confidence: finite number

ここではprobability sum（選択肢の確率値の合計）などの検証を再実装しない。
generic provider responseへ変換後、issue-0161 runner経由でissue-0138 adapterが検証する。

## 9. Confidence semantics

参照時点のJev公式docsでは、Choice confidence（提供元が返す確信度）はprobability distribution（各選択肢の確率分布）から導出される0〜1の値と説明されている。

MMIではこの値を正答率や、異なるprovider間で比較できる共通尺度としては扱わない。
既存のprovider-confidence namespaceへ保持するだけとする。

## 10. Model identity

既定のmodel id（モデル識別子）は `jev-latest`。

再現性が必要な評価ではcallerがversioned model idを明示する。
provider descriptor versionには**requestしたmodel id**を保持する。

floating alias（指す実体が更新され得る別名）を、特定版のモデルと同一視しない。

## 11. 非責務

- fetch
- API key
- environment variable
- retry/backoff
- live service availability
- threshold routing
- auto apply
- Noul / Score
