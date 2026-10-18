# Cognitive Review Presentation v1

## 1. 目的

`CognitiveReviewEnvelope`（認知結果と確認事項をまとめたデータ）を人間向けのreview surface（確認画面）へ渡す前に、Authority Plane（決定論的な検証を担う層）とCognitive Assistance Plane（認知による提案を担う層）の意味を混同しない、UI-neutralなprojection（画面実装に依存しない表示用データ）へ変換する。

この層はHTML、VS Code Webview、CSS、command registration（コマンド登録処理）に依存しない。review UIが認知結果を確定事実のように表示しないための**表示契約**である。

## 2. Section separation

presentation（表示用データ）は、次の4つのsection（区分）を持つ。

### Authority boundary

- source digest
- `review-only`
- `writeAuthority=none`
- Authority revalidation requirement
- 全requirementのstateは `pending`

Authority boundaryのsectionだけが、「適用前に満たすべき権威境界」を表す。

### Perception

- provider identity
- signal kind
- `matched / ambiguous / novel`
- visible candidate ranking
- winner（存在する場合）
- novelty score
- Fly provider固有metrics

候補順位やscore（評価値）をpresentation側で再計算しない。

### Judgment

- not requested
- proposal-only decision
- abstained / unsupported / unavailable

のいずれかの状態を示す。

decision（判断結果）を「承認」「確定」「適用可能」と表示する状態は持たない。

### Provenance

- source digest
- provider identity / version / execution boundary
- approved Format Profile id / label
- approval reference
- baseline source digest
- feature/source profile version

を保持する。

## 3. Metric isolation

metric（評価指標）は、意味や尺度を混ぜないようsectionごとに保持する。

```text
Perception metrics
  namespace = mmi.fly-worksheet-format

Judgment metrics
  namespace = judgment provider id
```

presentationには次の指標を作らない。

- combined score
- overall score
- total score
- cross-provider normalized score
- cross-provider threshold

値が同じ `0.8` でも、Providerによって意味が異なる可能性を保持する。

## 4. Candidate / Profile binding

Perceptionのvisible candidate（表示対象の候補）とEnvelopeのprofile ref（プロファイルへの参照）は、一対一で対応し、並び順も一致していなければならない。

presentationの各row（行）に含める項目は次のとおり。

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

未承認Profileやmissing Profile（対応するプロファイルが見つからない状態）をUI側で補完しない。

## 5. Raw data exclusion

presentationには次の原本データや操作用参照を含めない。

- worksheet cells
- cell text
- full abstract feature list
- source file bytes
- write handles

source identity（参照元の同一性）はdigest（内容の照合値）で扱う。

## 6. Tamper detection

projection（表示用データへの変換）の前に、最低限次の項目を再確認する。

- envelope schema version
- `review-only`
- `writeAuthority=none`
- Authority requirementが全てpending
- candidate/profile binding
- winnerがvisible candidate内
- Judgment source digest一致
- Judgment signalがproposal-only

Envelopeが型キャスト等で改変されていても、誤った表示へ進めずfail-closed（不正な状態を受け入れない扱い）とする。

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

production UI（製品の画面）への接続は、このpresentation contract（表示契約）が安定してから別Issueで扱う。
