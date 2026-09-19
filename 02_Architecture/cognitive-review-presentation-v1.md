# Cognitive Review Presentation v1

## 1. 目的

`CognitiveReviewEnvelope` を人間向けreview surfaceへ渡す前に、Authority PlaneとCognitive Assistance Planeの意味を混ぜないUI-neutralなprojectionへ変換する。

この層はHTML、VS Code Webview、CSS、command registrationを知らない。review UIが認知結果を確定事実のように表示しないための**表示契約**である。

## 2. Section separation

presentationは4 sectionを持つ。

### Authority boundary

- source digest
- `review-only`
- `writeAuthority=none`
- Authority revalidation requirement
- 全requirementのstateは `pending`

ここだけが「適用前に満たすべき権威境界」を表す。

### Perception

- provider identity
- signal kind
- `matched / ambiguous / novel`
- visible candidate ranking
- winner（存在する場合）
- novelty score
- Fly provider固有metrics

候補順位やscoreをpresentation側で再計算しない。

### Judgment

- not requested
- proposal-only decision
- abstained / unsupported / unavailable

のいずれか。

decisionを「承認」「確定」「適用可能」と表示する状態は持たない。

### Provenance

- source digest
- provider identity / version / execution boundary
- approved Format Profile id / label
- approval reference
- baseline source digest
- feature/source profile version

を保持する。

## 3. Metric isolation

metricはsectionごとに保持する。

```text
Perception metrics
  namespace = mmi.fly-worksheet-format

Judgment metrics
  namespace = judgment provider id
```

presentationに以下を作らない。

- combined score
- overall score
- total score
- cross-provider normalized score
- cross-provider threshold

同じ `0.8` でも意味が異なる可能性を保持する。

## 4. Candidate / Profile binding

Perception visible candidateとEnvelope profile refは1:1かつ同順序でなければならない。

presentation row:

```text
rank
prototypeId
profileLabel
approvalReference
confidence
deviationScore
sparseSimilarity
featureSimilarity
```

未承認Profileやmissing ProfileをUI側で補完しない。

## 5. Raw data exclusion

presentationは次を含めない。

- worksheet cells
- cell text
- full abstract feature list
- source file bytes
- write handles

source identityはdigestで扱う。

## 6. Tamper detection

projection前に最低限以下を再確認する。

- envelope schema version
- `review-only`
- `writeAuthority=none`
- Authority requirementが全てpending
- candidate/profile binding
- winnerがvisible candidate内
- Judgment source digest一致
- Judgment signalがproposal-only

Envelopeが型キャスト等で改変されていても、誤った表示へ進めずfail-closedする。

## 7. 非責務

- UI rendering
- localization copy
- action button
- apply command
- Authority revalidation実行
- Format Profile approval
- score recalculation
- provider invocation
- external XLSX / fill telemetry評価

production UIへの接続は、このpresentation contractが安定してから別Issueで扱う。
