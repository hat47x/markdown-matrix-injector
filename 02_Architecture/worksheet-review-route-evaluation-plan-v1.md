# Worksheet Review Route Evaluation Plan v1

## 1. 目的

provider評価の前に、評価条件を再現可能なmanifestとして固定する。

```text
Adjudicated Corpus
  |
  v
0171 Readiness
  |
  v
0172 Evaluation Packet identity
  |
  + Provider descriptor
  + Readiness policy
  |
  v
Evaluation Plan + planDigest
  |
  v
0174 Evaluation Runner
  |
  v
Report + groundTruthDigest
```

## 2. Plan identity

planはprovider inference条件を表す。

含める:
- evaluation packet digest
- readiness policy
- provider descriptor

含めない:
- expected route
- evidence
- annotation/adjudication identity
- provider outcome

## 3. Why labels are excluded

providerへ見せるinputが同じで、かつpredeclared readiness policyを引き続き満たすなら、label correctionだけでproviderを再実行しない。

label versionはissue-0172 reportの `groundTruthDigest` が担当する。

したがって:
- planDigest = inference-plan identity
- groundTruthDigest = evaluation-label identity

を混同しない。

## 4. Canonical provider descriptor

capability orderは意味を持たない。

plan保存時に:
- duplicate capabilityはprovider validationでreject。
- capabilitiesはsort。

provider descriptor比較もcanonical formで行う。

## 5. Readiness policy

defaultは持たない。

plan作成時にcallerが明示したpolicyをsnapshotする。

issue-0174 packet executionに必要な:
`requireProjectionForAllAdjudicated=true`
を必須とする。

## 6. Plan digest

SHA-256 input:
- representation
- labeling protocol
- packetDigest
- ordered readiness-policy fields
- provider id/version/category/executionBoundary
- sorted capabilities

JSON canonical tupleをhashする。

## 7. Planned execution

runtime providerがplan providerと異なる場合はprovider call前にreject。

current readinessが失われた場合:
- blocked result
- provider calls = 0

readinessは維持されているがpacketDigestが変わった場合:
- stale plan error
- provider calls = 0

ready + packet matchならissue-0174 runnerへ委譲。

## 8. External provider

planに `executionBoundary=external-opt-in` が入っていても、それ自体はopt-inではない。

実行時の `allowExternal=true` は引き続き必須。

## 9. 非責務

- credential保存。
- live transport。
- result persistence。
- retry/concurrency。
- statistical power。
- model ranking。
- deployment decision。
