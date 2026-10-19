# Executable Proposal Verified Review Surface v1

## 1. 目的

human-review UI（人が確認する画面）へ渡すUI-neutral surface（画面技術に依存しない表示用データ）に、Authority verification（決定論的な検証結果）だけでなく、**どのMMI Notation proposal（記法による適用提案）を検証したか**も保持する。

issue-0144では、次を扱う。

```text
Cognitive Review + Authority Receipt
```

issue-0147では、次を扱う。

```text
exact raw Notation -> proposal digest + Authority Evidence
```

本surface（確認画面へ渡すデータ）は、次の要素をまとめる。

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

proposal identity（提案の識別情報）のsectionに保持する項目は次のとおり。

- role = `executable-proposal-identity`
- sourceDigest
- algorithm = `sha256`
- representation = `mmi-notation-trimmed-utf8-v1`
- digest = `sha256:<hex>`

次の情報は保持しない。

- raw Notation
- query文字列
- filepath
- cell content

## 3. Composition order

生成関数は、次の順序を必須として実行する。

1. `bindExecutableProposalAuthorityEvidence`
2. `createVerifiedCognitiveReviewSurface`
3. source digest / Authority status cross-check
4. composite surface作成

この順序により、次のような部分的な合成を防ぐ。

- proposal identityを検証せずReceiptだけ表示する
- Receiptを検証せずproposal digestだけ表示する
- Presentationのsource identityを無視する

各検証結果の対応を確かめてから、composition（データの合成）を完了する。

## 4. Authority status

surfaceのAuthority status（検証結果の状態）は、issue-0144のoverlay（検証情報を重ねる構造）にのみ置く。

proposal sectionはAuthorityの判断結果を持たず、proposal identityだけを保持する。

composition時には、issue-0147のbinding（証拠と提案の対応付け）が返す `authorityStatus` と、overlayの `verificationStatus` が一致しなければfail-closed（安全側として処理を拒否）する。

## 5. Cognitive meaningは不変

Authorityが `satisfied`（検証条件を満たした状態）でも、次の意味は変わらない。

- Perceptionは候補
- Judgmentはproposal-onlyまたはnon-decision
- reviewはreview-only
- writeAuthorityはnone
- applyStatusはnot-authorized

これらの区分を維持する。

proposalに対するAuthority verificationと、人間による採用判断は、別のものとして保持する。

## 6. 不変性

入力となる次のデータは、

- Cognitive Review Envelope
- Cognitive Review Presentation
- Executable Proposal Authority Evidence

mutate（元の内容を書き換えること）しない。

返却するsurfaceでは、既存のPresentation（表示用データ）をそのままreview sectionに保持し、Authority overlayにはissue-0144で生成した結果を用いる。

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

将来production UI（製品の画面）へ接続する場合は、このsurfaceだけを表示入力とし、下位のEvidence（根拠情報）やReceipt（検証記録）を画面側で個別に組み替えないことを推奨する。
