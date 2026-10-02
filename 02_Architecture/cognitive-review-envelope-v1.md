# Cognitive Review Envelope v1

## 1. 目的

Cognitive Assistance Planeで個別に成立した次の成果を、**適用権限を持たないreview-only evidence**として一つに束ねる。

1. Fly-inspired Perception outcome
2. approved Format Profile
3. optional closed-choice Judgment outcome
4. Authority Planeで後続確認すべきrevalidation requirements

本Envelopeはproduction runtimeではなく、ADR-0018の「認知は助言し、Authorityが権威を持つ」を統合レベルで検証する実験境界である。

## 2. データフロー

```text
read-only worksheet snapshot
  -> approved Format Profiles -> matcher prototypes
  -> deterministic worksheet matcher
  -> Fly Perception outcome
                           \
review state / intent ------> optional Judgment outcome
                              |
                              v
                    CognitiveReviewEnvelope
                    disposition = review-only
                    writeAuthority = none
                              |
                              v
                    human / review UI
                              |
                              v
                    Authority revalidation
                              |
                              v
                    separate apply path
```

Envelopeからapply pathへ直接進むAPIは提供しない。

## 3. source identity

Envelopeのsource identityはPerception outcomeの `observation.sourceDigest` とする。

Judgment outcomeを同じEnvelopeへ含める場合、Judgmentの `observation.sourceDigest` も同一でなければならない。

observation id / schema versionはPerceptionとJudgmentで異なってよい。両者が同じ正本・同じsource-derived stateに由来することをdigestで固定する。

## 4. Format Profile binding

Perceptionのvisible candidateは、すべてapproved Format Profileへ結び付かなければならない。

検証するもの。

- profile status = `approved`
- explicit human approval metadata
- profile feature version
- source profile id
- source evidence contract
- candidate id -> profile id対応

callerがvisible candidate以外のapproved profile poolを渡しても、Envelopeにはvisible candidate分だけを収録する。

Perceptionが `novel` かつcandidateを1件も返さない場合、profile refは空でよい。

## 5. Judgment binding

Judgmentはoptional。

含める場合。

- provider category = `judgment`
- source digest = Perception source digest
- signalの場合は `closed-choice-judgment`
- signal payload disposition = `proposal-only`
- `abstained / unsupported / unavailable` は正常なnon-decisionとして保持

Judgment結果をProfile承認やNotation適用へ変換しない。

## 6. Authority revalidation requirements

Envelopeはrevalidationを完了したとは主張しない。v1では全requirementsを `pending` で保持する。

常時必要は次のとおりです。

- `source-identity`
- `profile-compatibility`

実行可能なNotation proposal等が存在する場合に必要:

- `parser`
- `parameter-schema`
- `resolver`
- `containment`
- `source-existence`
- `preview`

このmoduleにはrequirementを `completed` に更新する関数を置かない。完了判定はAuthority Plane側の別経路で行う。

## 7. 明示的な非権限

Envelopeは常に:

```text
disposition = review-only
writeAuthority = none
```

とする。

以下のAPIを持たない。

- source-of-truth write
- Markdown mutation
- Format Profile approval
- matcher threshold変更
- Cognitive score統合
- automatic apply

## 8. 並列レーンとの境界

issue-0139以降のfill telemetry / external XLSX評価は別レーンとする。

本Issueは以下へ触れない。

- `xlsxFormatSnapshot*`
- `worksheetFormatFillReviewTelemetry*`
- external fixture群
- `experimental/README.md`
- `flyInspiredFormatMatcher.ts`
- `worksheetFormatFeatureAdapter.ts`
- production runtime
