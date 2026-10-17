# Closed-choice Judgment Provider Port v1

## 1. 目的

Jev等の外部またはローカルのJudgment実装（判断を担う処理）をMMIへ接続する前に、provider invocation（providerを呼び出す処理）の安全境界を一か所に定める。

TypeSafe AIの公開情報では、Jevはtyped decision（型が定まった判断結果）をsoftware workflow（ソフトウェア上の一連の処理）へ返す用途を掲げている。
MMIでは、provider固有の能力をAuthorityへ昇格させず、既存のclosed-choice adapter（定められた選択肢への応答を扱う接続部）の `proposal-only`（提案としてのみ扱う）契約に必ず従わせる。

参考は次のとおりです。
- https://typesafe.ai/blog/introducing-system-one-models-and-jev
- https://typesafe.ai/

vendor（提供企業）が示す速度・価格・calibration（確信度と正答の対応）等の情報は、MMIの安全保証として採用しない。

## 2. Provider contract

provider（判断を返す処理の実装）は、次の2つを持つ。

- immutableとして扱うdescriptor
- async `decide(request)`

descriptorはproviderの属性を記述する情報で、ここでは変更しないものとして扱う。`decide(request)`は非同期で判断を返す処理である。

request（判断処理へ渡す入力）は、次の情報を含む。

- Cognitive Observation
- Closed-choice Question

Cognitive Observationは認知処理に渡す観測情報、Closed-choice Questionは定められた選択肢から判断を求める質問を指す。

providerはWorkbook handle（Workbookを操作するための参照）、write API（書き込み用のインターフェース）、Authority objectを受け取らない。

## 3. External opt-in

`descriptor.executionBoundary === 'external-opt-in'` の場合、runner option（実行時の指定）に `allowExternal=true` がない限りproviderを呼ばない。`external-opt-in` は、外部接続に明示的な許可が必要な区分である。

呼び出しの拒否は、provider invocationの前に行う。

これはcloud fallback（クラウド側への自動切り替え）ではない。外部providerを使うかどうかは、caller（呼び出し側）が毎回明示する。

## 4. Input isolation

providerへ渡すObservation / Questionは、`structuredClone`（元のデータから独立したコピーを作る処理）で複製した値とする。

providerが受け取ったobjectをmutate（変更）しても、caller-owned data（呼び出し側が保持するデータ）は変化しない。

descriptor（providerの属性を記述したもの）も呼び出し前にclone（複製）し、そのsnapshot（その時点の複製）をOutcome provenance（結果の出典情報）に使う。

そのため、providerが呼び出し中に自身のdescriptorを変更しても、Outcome（処理結果）には影響しない。

## 5. Response handling

provider response（providerからの応答）を、そのままOutcomeとして信用しない。

既存の次の処理を必ず通す。

```text
adaptClosedChoiceResponse
```

その際、次の項目を再検証する。

- declared choice
- exact distribution keys
- probability range / sum
- selected probability
- confidence
- Judgment category
- closed-choice capability

## 6. Provider failures

providerのthrow/reject（例外の送出やPromiseの拒否）は、runner（呼び出しを管理する処理）で `unavailable` へ自動変換しない。

理由は、次の異なる原因を一律に同じ意味へまとめないためである。

- network unavailable
- auth failure
- programming bug
- schema bug

provider固有のadapterが必要な場合は、そこで明示的に `unavailable` responseへ変換する。

## 7. Jevとの関係

本port（providerとの接続口）は、Choice相当のclosed-choice（定められた選択肢から選ぶ判断）に限定する。

Noul / Scoreを同じportへ混在させない。
primitive（判断の基本形式）ごとにconfidence semantics（確信度の意味）が異なるため、後続Issueで別contract（契約）として扱う。

live Jev adapter（実際のJevとの接続部）は、次の事項を含めて別Issueで追加する。

- explicit external opt-in
- API credential管理
- state projection
- timeout/retry
- provider-specific response mapping

## 8. 非責務

- live network
- SDK dependency
- API key
- automatic retry
- provider fallback
- threshold決定
- auto apply / auto accept
- source mutation
