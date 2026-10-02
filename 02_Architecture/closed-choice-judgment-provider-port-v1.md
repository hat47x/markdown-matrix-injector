# Closed-choice Judgment Provider Port v1

## 1. 目的

Jev等の外部/ローカルJudgment実装をMMIへ接続する前に、provider invocationの安全境界を1箇所へ固定する。

TypeSafe AIの公開情報ではJevはtyped decisionをsoftware workflowへ返す用途を掲げている。
MMIではprovider固有能力をAuthorityへ昇格させず、既存closed-choice adapterの `proposal-only` 契約へ必ず落とす。

参考は次のとおりです。
- https://typesafe.ai/blog/introducing-system-one-models-and-jev
- https://typesafe.ai/

vendorの速度・価格・calibration等はMMIの安全保証として採用しない。

## 2. Provider contract

providerは:

- immutableとして扱うdescriptor
- async `decide(request)`

を持つ。

request:
- Cognitive Observation
- Closed-choice Question

providerはWorkbook handle、write API、Authority objectを受け取らない。

## 3. External opt-in

`descriptor.executionBoundary === 'external-opt-in'` の場合、
runner option `allowExternal=true` がない限りproviderを呼ばない。

拒否はprovider invocation前。

これはcloud fallbackではない。
外部providerを使うかどうかはcallerが毎回明示する。

## 4. Input isolation

providerへ渡すObservation / Questionは `structuredClone` した値。

providerが受領objectをmutateしてもcaller-owned dataは変化しない。

descriptorもcall前にcloneし、そのsnapshotをOutcome provenanceへ利用する。

したがってproviderがcall中に自身のdescriptorを変更してもOutcomeには影響しない。

## 5. Response handling

provider responseをそのままOutcomeとして信用しない。

既存は次のとおりです。

```text
adaptClosedChoiceResponse
```

を必ず通しは次のとおりです。

- declared choice
- exact distribution keys
- probability range / sum
- selected probability
- confidence
- Judgment category
- closed-choice capability

を再検証する。

## 6. Provider failures

provider throw/rejectはrunnerで `unavailable` へ自動変換しない。

理由は次のとおりです。
- network unavailable
- auth failure
- programming bug
- schema bug

を一律に同じ意味へ潰さないため。

provider固有adapterが必要なら、そこで明示的に `unavailable` responseへ変換する。

## 7. Jevとの関係

本portはChoice相当のclosed-choiceに限定する。

Noul / Scoreを同じportへ混在させない。
primitiveごとにconfidence semanticsが異なるため、後続Issueで別contractとして扱う。

live Jev adapterは:
- explicit external opt-in
- API credential管理
- state projection
- timeout/retry
- provider-specific response mapping

を別Issueで追加する。

## 8. 非責務

- live network
- SDK dependency
- API key
- automatic retry
- provider fallback
- threshold決定
- auto apply / auto accept
- source mutation
