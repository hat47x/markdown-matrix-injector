# Unified Human Review View Model v1

## 1. 目的

human-review UIへ渡す最終データ形を、由来の異なる4領域に固定する。

```text
1. Proposal Identity
2. Authority
3. Cognitive
4. Deterministic
```

このview modelは意思決定器ではない。

- 総合点を計算しない
- accepted / approvedを生成しない
- apply authorityを付与しない
- Cognitiveとdeterministic reasonを同じevidence種別へ変換しない

## 2. Proposal Identity

exact proposalを識別するintegrity情報のみを保持する。

- sourceDigest
- algorithm
- representation
- proposalDigest

raw Notationは保持しない。

## 3. Authority

Authority sectionは2層。

### Review boundary

- disposition = review-only
- writeAuthority = none
- applyStatus = not-authorized
- pending revalidation contract

### Verification

- satisfied / blocked
- scope
- issuer
- check results
- failed checks

`satisfied` はproposalの人間承認を意味しない。

## 4. Cognitive

- Perception
- Judgment
- provenance

のみ。

Authority statusはCognitive sectionへコピーしない。
deterministic review reasonもCognitive evidenceへコピーしない。

## 5. Deterministic

- deterministic producer
- reason taxonomy
- reviewRelevant / diagnostic counts
- paired comparison

を保持する。

Cognitive provider descriptorやAuthority issuerへ変換しない。

## 6. Projection-time revalidation

入力artifactは作成後にobject mutationされる可能性があるため、view model生成時に:

1. `createDeterministicReviewEvidenceSurface` を再実行
2. executable proposal surface schema/identityを検証
3. source digestを4領域で照合
4. review-only/no-write boundaryを確認

する。

## 7. No overall verdict

意図的に以下を持たない。

- overallStatus
- overallScore
- combinedScore
- recommendation
- accepted
- approved
- canApply

UIが必要とする「注意が必要か」の導出も、このcontract内では行わない。
各sectionの意味を人間が独立に確認できることを優先する。

## 8. 非責務

- UI rendering
- human approval
- apply command
- provider invocation
- matcher execution
- telemetry生成
- source mutation
- Receipt issuer authentication
