# Executable Proposal Verified Review Surface v1

## 1. 目的

human-review UIへ渡す最終のUI-neutral surfaceに、Authority verificationだけでなく**どのMMI Notation proposalを検証したか**を保持する。

issue-0144:

```text
Cognitive Review + Authority Receipt
```

issue-0147:

```text
exact raw Notation -> proposal digest + Authority Evidence
```

本surface:

```text
exact proposal identity
        +
Cognitive Review Presentation
        +
Authority Verification Overlay
        |
        v
ExecutableProposalVerifiedReviewSurfaceV1
```

## 2. Proposal identity section

保持する情報:

- role = `executable-proposal-identity`
- sourceDigest
- algorithm = `sha256`
- representation = `mmi-notation-trimmed-utf8-v1`
- digest = `sha256:<hex>`

保持しない:

- raw Notation
- query文字列
- filepath
- cell content

## 3. Composition order

生成関数は以下を必須順序で実行する。

1. `bindExecutableProposalAuthorityEvidence`
2. `createVerifiedCognitiveReviewSurface`
3. source digest / Authority status cross-check
4. composite surface作成

これにより:

- proposal identityを検証せずReceiptだけ表示する
- Receiptを検証せずproposal digestだけ表示する
- Presentationのsource identityを無視する

という部分的compositionを避ける。

## 4. Authority status

surfaceのAuthority statusはissue-0144 overlayにのみ存在する。

proposal sectionはAuthority判断を持たず、proposal identityだけを持つ。

composition時にissue-0147 bindingの `authorityStatus` とoverlayの `verificationStatus` が一致しなければfail-closedする。

## 5. Cognitive meaningは不変

Authorityが `satisfied` でも:

- Perceptionは候補
- Judgmentはproposal-onlyまたはnon-decision
- reviewはreview-only
- writeAuthorityはnone
- applyStatusはnot-authorized

のままである。

proposalのAuthority verificationと、人間による採用判断は別物として保持する。

## 6. 不変性

入力:

- Cognitive Review Envelope
- Cognitive Review Presentation
- Executable Proposal Authority Evidence

をmutateしない。

返却surfaceでは既存Presentationをそのままreview sectionとして保持し、Authority overlayはissue-0144生成物を用いる。

## 7. 非責務

- UI rendering
- apply button
- human approval action
- Receipt issuer authentication
- proposal semantic canonicalization
- provider invocation
- source mutation
- production plugin/extension wiring
- fill telemetry / external-XLSX評価

次段階でproduction UIへ接続する場合は、このsurfaceだけを表示入力とし、下位Evidence/Receiptを個別に組み替えないことを推奨する。
