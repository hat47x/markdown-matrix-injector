# Authority Revalidation Receipt v1

## 1. 目的

Cognitive Review Envelopeは、認知結果をreview対象として束ねるが、Authority Planeの検証完了を表現しない。

Envelope内のrevalidation requirementsは常に `pending` のままとする。

Authority Planeが別経路で実行したdeterministic check結果は、`AuthorityRevalidationReceiptV1` としてEnvelopeとは別に保持する。

```text
CognitiveReviewEnvelope
  authority requirements = pending
            |
            | source digest + required checks
            v
Authority Plane
  parser / schema / resolver / containment / source existence / preview
            |
            v
AuthorityRevalidationReceiptV1
            |
            | validate + bind, no mutation
            v
satisfied | blocked
```

## 2. Receiptは認証トークンではない

TypeScriptの構造型だけで「本当にAuthority Planeが発行した」ことを証明することはできない。

v1で保証するのは:

- issuer metadataが明示される
- source digestが一致する
- requirement集合が一致する
- scopeとstatusの組み合わせが妥当
- evidence codeが存在する

という**構造・整合性境界**である。

production接続時は、Receipt builderをAuthority module内部へ閉じる、署名やprocess boundaryを導入する等、実行主体の真正性を別途担保する必要がある。

Cognitive providerがissuer文字列を自称できないことを、本契約だけで保証したとは扱わない。

## 3. Scope

### `review-evidence`

現在のreview対象が認知evidenceそのもので、実行可能なMMI Notation proposalを適用しない場合。

- `source-identity`: passed / failed
- `profile-compatibility`: passed / failed
- parser以降の `executable-proposal` checks: not-applicable

### `executable-proposal`

後続段階で実行可能なNotation proposalをAuthority Planeへ渡した場合。

- always checks: passed / failed
- executable-proposal checks: passed / failed
- not-applicableは禁止

## 4. Check result

各check resultは:

- check id
- `passed | failed | not-applicable`
- stable evidence code
- optional detail

を持つ。

ReceiptはEnvelopeに要求されたcheckを**ちょうど1回ずつ**含む。

- missing不可
- extra不可
- duplicate不可

check順序はReceipt側では自由だが、binding resultはEnvelope requirement順にcanonicalizeする。

## 5. Binding result

`bindAuthorityRevalidationReceipt` はEnvelopeを書き換えない。

返すのは別のbinding summaryのみ。

```text
status = satisfied | blocked
sourceDigest
scope
issuer
checks (Envelope順)
failedChecks
```

1件でも `failed` があれば `blocked`。

scope規則に従った `not-applicable` はfailureではない。

## 6. Evidence code

evidence codeは空文字を許可しない。

v1ではdetailの自由文を許すが、evidence codeそのものはmachine-readableなstable tokenとして扱う。

例は次のとおりです。

- `SOURCE_DIGEST_MATCHED`
- `PROFILE_CONTRACT_MATCHED`
- `PARSER_ACCEPTED`
- `CONTAINMENT_REJECTED`
- `NO_EXECUTABLE_PROPOSAL`

本Issueではcode catalog自体を標準化しない。

## 7. 非責務

- parser/resolver等の実行
- Receiptの真正性認証
- cryptographic signature
- production apply
- Envelope mutation
- Presentation mutation
- Cognitive provider invocation
- fill telemetry / external XLSX evaluation

Authority実装との実接続は別Issueで扱う。
