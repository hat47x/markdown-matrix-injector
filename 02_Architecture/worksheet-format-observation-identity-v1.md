# Worksheet Format Observation Identity v1

## 1. 目的

Fly Perceptionと後続deterministic reviewが、同じderived worksheet format stateを参照していることをraw feature vectorなしで照合する。

    source bytes identity
           |
           v
    Worksheet snapshot
           |
           v
    format feature extraction
           |
           v
    source-profile filtering
           |
           v
    normalized compared features
           |
           v
    WorksheetFormatObservationIdentityV1

## 2. Identity scope

このidentityは次ではない。

- source file hash
- exact Worksheet snapshot hash
- business data content hash
- privacy token

対象はcurrent matcherが比較対象としたderived format stateのみ。

## 3. Canonical representation

representation:

    worksheet-format-compared-features-v1

canonical serialization:

    JSON([
      representation,
      sourceDigest,
      featureVersion,
      sourceProfileId,
      sorted sourceEvidence,
      normalized comparedFeatures
    ])

SHA-256を計算し sha256:<64 hex> として保持する。

## 4. Feature normalization

既存 normalizeFormatFeatures を利用する。

つまりtrim / normalization / dedupe / deterministic sortは既存matcherと同じ規則へ寄せる。

identity専用のfeature normalizerを作らない。

## 5. Evidence filtering

snapshotからidentityを再計算する場合:

1. extractWorksheetFormatFeatures
2. filterWorksheetFormatFeaturesByEvidence
3. normalizeFormatFeatures

の順を使う。

source profileが観測保証しないborder等はidentity inputへ入れない。

このためidentityはmatcher comparison semanticsと揃う。

## 6. Artifact

    WorksheetFormatObservationIdentityV1
    ├─ schemaVersion
    ├─ role
    ├─ algorithm
    ├─ representation
    ├─ digest
    ├─ sourceDigest
    ├─ featureVersion
    ├─ sourceProfileId
    └─ sourceEvidence

raw featuresは持たない。

## 7. Fly Perception

Fly Perception payloadはidentityを内部provenanceとして保持する。

human-review Presentationはこのfieldを投影しない。

    Envelope internal provenance: yes
    default human review display: no

## 8. Review Envelope

Envelope生成時にidentityのschema / digest syntax / sourceDigest / featureVersion / sourceProfileId / sourceEvidenceをPerception contextへ再bindingする。

## 9. Deterministic review

issue-0159 low-level workflowでは、callerから受けるobservation snapshotからidentityを再計算する。

不一致:

    identity mismatch
     -> deterministic analysisしない
     -> Authority Workbook loadしない
     -> final review modelを返さない

一致後もissue-0154 matcher-result bindingを実施する。

## 10. Contained unified review

issue-0160は同じsnapshot objectを内部共有する。

identityは同一snapshot利用を置き換えず、explicit audit provenance / low-level API safety / future orchestrationでのrebind capabilityを追加する。

## 11. Privacy

digestはraw featureを直接露出しないが、secretではない。

特に低entropy header名等に対してdigestが匿名化保証を与えるとは扱わない。

そのためexternal provider opt-in原則は変えない。

## 12. Versioning

次の場合はrepresentationまたはschemaのversion更新を検討する。

- canonical serialization変更
- identity対象をcompared features以外へ拡張
- digest algorithm変更
- source-profile binding意味変更

単なるworksheet feature version更新はartifactのfeatureVersionで区別できる。

## 13. 非責務

- source-file identity
- snapshot persistence
- encryption
- provider confidence
- matcher score
- review priority
- Authority verdict
- UI rendering
