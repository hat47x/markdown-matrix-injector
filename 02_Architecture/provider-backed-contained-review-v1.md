# Provider-backed Contained Unified Review v1

## 1. 目的

contained sourceから得たPerceptionを、provider-neutral closed-choice Judgmentへ安全に渡し、その結果を既存4-domain review modelへ統合する。

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

providerはsource Observationそのものを受け取らない。

派生payload:
- kind = worksheet-format-review-route
- sheetName
- classification
- candidateIds
- optional winnerPrototypeId
- noveltyScore

含めない:
- cells
- merges
- raw features
- absolute source path
- source bytes
- WorkbookData

provenanceはsource ObservationからsourceKind/sourceDigest/featureVersion/sourceProfileIdをcopyする。

## 3. Why a separate Observation

Judgment providerへ渡す情報を、Perception APIやWorksheet snapshotの将来拡張から隔離する。

「providerが見てよいderived state」を明示型にすることで、Observation payloadへ将来raw情報が増えても自動的に外部providerへ流れない。

## 4. External opt-in

provider invocationはissue-0161 `runClosedChoiceJudgmentProvider` を必ず通す。

external-opt-in providerは `allowExternalJudgment=true` なしでは呼ばない。

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

provider拒否/失敗/invalid responseではAuthority loaderへ進まない。

## 6. Source changes during provider wait

stable read window終了後、provider call中にsourceが変化する可能性はある。

workflowはprovider call中filesystem lockを保持しない。
代わりにAuthority側がEnvelope sourceDigestと現在source bytesを再照合する。

変化していれば最終modelはAuthority `blocked(source-identity)` となる。

Cognitive/Deterministic結果は「以前のstable source stateに対する記述」として改変しない。

## 7. Provider-specific projection

Jev adapterなどは派生Observationをさらに明示 `projectState` してprovider transportへ送る。

したがって二段階になる。

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
