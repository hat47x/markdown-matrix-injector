# Worksheet Review Route Comparison Execution Record v1

## 1. 目的

predeclared comparison planとそのpolicy resultを一体のimmutable artifactへ固定する。

```text
0186 Comparison Plan
      |
      v
0181 Comparison
      |
      v
0183 Policy Result
      |
      v
0188 Execution Record
  planDigest
  left/right recordDigest
  executionDigest
```

## 2. Linkage

recordはplan/resultを単に同梱するだけでなく、以下を照合する。

- planDigest。
- directional left/right recordDigest。
- result.comparison left/right recordDigest。
- result.policyとplan.policy。

## 3. executionDigest

executionDigestはrecord content identity。

秘密鍵署名やtrusted timestampではない。

## 4. Noncompliance

0183 policy resultが `compliant=false` でもrecord作成可能。

これはは次のとおりです。
- planned comparison自体は実行された。
- 明示change policyには違反した。

という2つの事実を分離するため。

## 5. Non-disclosure

新規に以下を複製しないは次のとおりです。
- raw worksheet。
- evidence facts。
- annotations。
- provider probabilities/confidence。
- expected route値。

result/comparisonが既に保持するchange dimensionsだけをsnapshotする。

## 6. 非責務

- filesystem/database/cloud persistence。
- signature / trusted timestamp。
- better/worse。
- provider ranking。
- deployment approval。
