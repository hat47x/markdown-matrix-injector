# Cognitive Review Envelope v1

## 1. 目的

Cognitive Assistance Plane（認知による候補や判断を支援する層）で得られた次の成果を、**適用権限を持たないreview-only evidence（人が確認するための根拠情報）**として一つにまとめる。

1. Fly-inspired Perception outcome
2. approved Format Profile
3. optional closed-choice Judgment outcome
4. Authority Planeで後続確認すべきrevalidation requirements

本Envelope（認知結果と確認事項をまとめるデータ）はproduction runtime（製品の実行時処理）ではなく、ADR-0018で定めた「認知は助言し、Authorityが権威を持つ」という境界を、結果の統合時にも守れるか確認するための実験上の仕組みである。

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

Envelopeからapply path（実際の適用処理の経路）へ直接進むAPI（呼び出し口）は提供しない。

## 3. source identity

Envelopeのsource identity（参照元の同一性）には、Perception outcome（認知による候補抽出の結果）が持つ `observation.sourceDigest` を用いる。

Judgment outcome（閉集合判断の結果）を同じEnvelopeへ含める場合は、Judgment側の `observation.sourceDigest` も同じ値でなければならない。

observation id（観測の識別子）とschema version（構造定義の版）は、PerceptionとJudgmentで異なってよい。両者が同じ正本・同じsource-derived state（参照元から作られた状態）に由来することをdigestで固定する。

## 4. Format Profile binding

Perceptionが提示するvisible candidate（表示対象の候補）は、すべてapproved Format Profile（人が承認した書式プロファイル）に結び付かなければならない。

照合する項目は次のとおり。

- profile status = `approved`
- explicit human approval metadata
- profile feature version
- source profile id
- source evidence contract
- candidate id -> profile id対応

caller（呼び出し側）がvisible candidate以外も含むapproved profile pool（承認済みプロファイルの集合）を渡しても、Envelopeに収録するのはvisible candidateに対応する分だけとする。

Perceptionの結果が `novel`（既知の書式候補に当てはまらない）で、candidateを1件も返さない場合は、profile ref（プロファイルへの参照）が空でもよい。

## 5. Judgment binding

Judgment（閉集合に対する判断結果）の追加はoptional（任意）である。

含める場合は次を確認する。

- provider category = `judgment`
- source digest = Perception source digest
- signalの場合は `closed-choice-judgment`
- signal payload disposition = `proposal-only`
- `abstained / unsupported / unavailable` は正常なnon-decisionとして保持

Judgment結果をProfileの承認やNotationの適用へ変換しない。

## 6. Authority revalidation requirements

Envelopeはrevalidation（Authority側での再検証）が完了したとは主張しない。v1では、すべてのrequirements（必要な確認項目）を `pending`（未完了）として保持する。

常に必要な確認項目は次のとおり。

- `source-identity`
- `profile-compatibility`

実行可能なNotation proposal（記法の変更提案）などがある場合に必要な確認項目は次のとおり。

- `parser`
- `parameter-schema`
- `resolver`
- `containment`
- `source-existence`
- `preview`

このmodule（実装単位）には、requirementを `completed`（完了）に更新する関数を置かない。完了判定はAuthority Plane側の別経路で行う。

## 7. 明示的な非権限

Envelopeには常に次の値を設定する。

```text
disposition = review-only
writeAuthority = none
```

これらは、人による確認と実際の適用を分離するための設定である。

次のAPIは持たない。

- source-of-truth write
- Markdown mutation
- Format Profile approval
- matcher threshold変更
- Cognitive score統合
- automatic apply

## 8. 並列レーンとの境界

issue-0139以降のfill telemetry（塗りつぶし情報の観測記録）とexternal XLSX評価（外部のExcelファイルを使う評価）は、本件とは別の作業経路で扱う。

本Issueでは次の実装や資料を変更しない。

- `xlsxFormatSnapshot*`
- `worksheetFormatFillReviewTelemetry*`
- external fixture群
- `experimental/README.md`
- `flyInspiredFormatMatcher.ts`
- `worksheetFormatFeatureAdapter.ts`
- production runtime
