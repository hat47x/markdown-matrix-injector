# Worksheet Review Route Evaluation Record v1

## 1. 目的

完了したprovider evaluationを、後から同じ条件・同じprovider output・どのground truthで評価したか追跡できるtyped artifactへ固定する。

```text
0176 Evaluation Plan
        +
0172 Provider-visible Evaluation Packet
        +
0172 Provider Response
        +
0172 Evaluation Report
        |
        v
Evaluation Record
  planDigest
  packetDigest
  groundTruthDigest
  recordDigest
```

## 2. Four identities

### planDigest

provider inference条件。
readiness policy + provider descriptor + provider-visible packet identity。

### packetDigest

provider-visible case state集合。

### groundTruthDigest

current adjudicated final labels。

### recordDigest

plan + provider-visible packet + response + reportを含むrecord全体のcontent identity。

これらを1つのhashへ意味的に潰さない。

## 3. recordDigest is not a signature

recordDigestはaccidental mutation / content identity確認用。

秘密鍵署名、MAC、trusted timestampではない。
recordとdigestの両方を書き換えられる主体に対するauthenticityは保証しない。

将来persistent audit storeへ接続する場合は署名/append-only storeを別Issueで検討する。

## 4. Stored provider-visible packet

planのpacketDigestだけでは、後から実際のprovider-visible stateを復元できない。

そのためrecordにはissue-0172のblinded evaluation packetをsnapshotする。

packet validatorは:
- canonical question。
- unique/canonical case order。
- exact four-field state。
- caseDigest再計算。
- packetDigest再計算。

をfail-closedで確認する。

raw worksheet/evidence/annotationsは保存しない。

## 5. Provider result binding

response outcomeごとに:
- caseId
- caseDigest
- outcome.observation.id
- outcome.observation.sourceDigest
- outcome.observation.schemaVersion

を照合する。

これにより別case/state outcomeの付け替えをrecord境界でもfail-closedする。

## 6. Provider identity

plan provider / report provider / response outcome providerは同一identityを要求する。

capabilitiesは順序ではなくcanonical sorted setとして比較する。

## 7. Case order

issue-0172 evaluation packetはcase idでcanonical sortする。

recordでは:
- response outcomes
- report evaluatedCaseIds
- report summary.caseResults

を同じcanonical case orderへ要求する。

record再生時の手作業reorderを許容しない。

### Report semantic recomputation

record validatorはreportを単に型検証しない。

- caseResultsのexpectedRouteからgroundTruthDigest再計算。
- stored response + labelsからsummary再計算。
- stored packet state + labelsからprojection separability再計算。

し、stored reportとcanonical deep-equalを要求する。

これによりrecordDigestだけ再計算したmetric改ざんもrejectする。

## 8. Offline ground-truth re-evaluation

stored provider responseはprovider-visible packetDigestへbinding済み。

label-only correction後:
- readiness policyを再確認。
- responseをcurrent corpusへissue-0172 evaluatorで再join。
- projection state同一ならprovider inferenceを再利用。
- groundTruthDigest / metrics / recordDigestだけ更新。

providerは呼ばない。

## 9. Stale boundaries

### projection changed

response packetDigest != current packetDigest。
offline re-evaluation reject。

### readiness lost

predeclared evaluation populationとして条件を満たさなくなったためreject。

### provider changed

stored responseを別provider planへ移植しない。

## 10. Non-disclosure

recordにはlabel corpus自体を保存しない。

したがって以下を新規追加しない:
- evidence facts
- annotations
- annotatorRef
- adjudicatorRef
- raw worksheet/cells/features

reportにはexpected routeごとのaggregate/case resultが含まれるため、recordはground-truth-derived evaluation artifactでありprovider input artifactではない。

## 11. 非責務

- filesystem/database persistence。
- cryptographic authenticity signature。
- trusted timestamp。
- provider invocation。
- live Jev。
- credential storage。
- deployment approval。
- production routing/apply。
