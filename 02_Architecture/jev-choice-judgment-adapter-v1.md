# Jev Choice Judgment Adapter v1

## 1. 目的

Jev ChoiceをMMIのprovider-neutral Closed-choice Judgment portへ接続する。

本adapterはnetwork clientではない。

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

2026-09-20時点のTypeSafe公式docsではSystem One APIは:

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

参考:
- https://docs.typesafe.ai/api
- https://docs.typesafe.ai/primitives/choice

## 3. Transport injection

adapterは以下だけに依存する。

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

これによりunit testはnetwork不要。

## 4. Explicit state projection

ObservationをそのままJevへ送らない。

callerが:

```ts
projectState(observation)
```

を明示する。

review用途なら、raw worksheetではなくderived stateだけを投影できる。

## 5. Choice criteria

callerは各choiceについて:

```ts
describeChoice(choice, question)
```

を提供する。

nullも許容するが、暗黙生成はしない。

## 6. Choice cardinality

公式docsのChoice上限255に合わせ:

- 2未満: existing question contractで拒否
- 256以上: Jev adapterで拒否

する。

## 7. State validation

Jev stateはJSON-compatibleな:
- string
- object
- array

に限定する。

拒否:
- undefined
- function
- symbol
- bigint
- NaN / Infinity
- cyclic reference
- Date / class instance等のnon-plain object

transportへ渡す前に検証する。

## 8. Response mapping

transport responseはunknownとして受け、shapeを検証する。

必要:
- model: non-empty string
- answers.decision
- type = choice
- choice: string
- probabilities: object
- confidence: finite number

ここではprobability sum等を再実装しない。
generic provider responseへ変換後、issue-0161 runner経由でissue-0138 adapterが検証する。

## 9. Confidence semantics

Jev公式docsではChoice confidenceはprobability distributionから導出される0〜1値とされる。

MMIではこの値を正答率や他providerと共通尺度とは扱わない。
既存のprovider-confidence namespaceへ保持するだけとする。

## 10. Model identity

defaultは `jev-latest`。

再現性が必要な評価ではcallerがversioned model idを明示する。
provider descriptor versionには**requestしたmodel id**を保持する。

floating aliasをexact model versionとみなさない。

## 11. 非責務

- fetch
- API key
- environment variable
- retry/backoff
- live service availability
- threshold routing
- auto apply
- Noul / Score
