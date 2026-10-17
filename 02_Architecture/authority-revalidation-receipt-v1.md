# Authority Revalidation Receipt v1

## 1. 目的

Cognitive Review Envelope（認知結果と検証要求をレビュー用にまとめた情報）は、認知結果をreview対象として束ねるが、Authority Plane（記法や参照元などを既存の規則で検証する処理層）の検証完了を表すものではない。

Envelope内のrevalidation requirements（再検証が必要な項目）は、常に `pending`（保留中）のままとする。

Authority Planeが別経路で実行したdeterministic check（同じ条件であれば同じ結果となる検証）の結果は、`AuthorityRevalidationReceiptV1`（再検証結果を記録するReceipt）としてEnvelopeとは別に保持する。

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

TypeScriptの構造型（必要な項目と型が揃っているかを見る仕組み）だけでは、「本当にAuthority Planeが発行した」ことまでは証明できない。

v1で保証するのは:

- issuer metadataが明示される
- source digestが一致する
- requirement集合が一致する
- scopeとstatusの組み合わせが妥当
- evidence codeが存在する

という**構造・整合性境界**である。これは、記録の内容が契約に合っているかを確かめるもので、発行者の真正性を証明するものではない。

production接続時は、Receipt builder（Receiptを組み立てる処理）をAuthority module内部へ閉じる、署名やprocess boundary（処理主体を分ける境界）を導入する等、実行主体の真正性を別途担保する必要がある。

Cognitive provider（認知結果を提供する側）がissuer文字列（発行者を示す値）を自称できないことまで、本契約だけで保証したとは扱わない。

## 3. Scope

Scopeは、Receiptが何を対象として検証したかを示す区分である。

### `review-evidence`

現在のreview対象が認知evidence（認知結果の根拠情報）そのものであり、実行可能なMMI Notation proposal（記法による提案）を適用しない場合。

- `source-identity`: passed / failed
- `profile-compatibility`: passed / failed
- parser以降の `executable-proposal` checks: not-applicable

### `executable-proposal`

後続段階で実行可能なNotation proposal（MMIの参照記法による提案）をAuthority Planeへ渡した場合。

- always checks: passed / failed
- executable-proposal checks: passed / failed
- not-applicableは禁止

## 4. Check result

各check result（個々の検証結果）は、次の項目を持つ。

- check id
- `passed | failed | not-applicable`
- stable evidence code
- optional detail

を持つ。

Receiptは、Envelopeで要求されたcheckを**ちょうど1回ずつ**含む。

- missing不可
- extra不可
- duplicate不可

Receipt内のcheckの順序は自由だが、binding result（EnvelopeとReceiptを突き合わせた結果）はEnvelope requirement順にcanonicalize（順序を統一）する。

## 5. Binding result

`bindAuthorityRevalidationReceipt`（EnvelopeとReceiptを照合する処理）は、Envelopeを書き換えない。

返すのは、照合結果を要約した別のbinding summaryのみである。

```text
status = satisfied | blocked
sourceDigest
scope
issuer
checks (Envelope順)
failedChecks
```

1件でも `failed` があれば `blocked`。

scopeの規則に従った `not-applicable`（検証対象外）はfailureではない。

## 6. Evidence code

evidence code（検証結果を機械的に識別するコード）は、空文字を許可しない。

v1ではdetail（補足説明）に自由文を許すが、evidence codeそのものはmachine-readable（機械で読み取れる）なstable token（固定の識別値）として扱う。

例は次のとおりです。

- `SOURCE_DIGEST_MATCHED`
- `PROFILE_CONTRACT_MATCHED`
- `PARSER_ACCEPTED`
- `CONTAINMENT_REJECTED`
- `NO_EXECUTABLE_PROPOSAL`

このIssueでは、code catalog（evidence codeの一覧）そのものは標準化しない。

## 7. 非責務

- parser/resolver等の実行
- Receiptの真正性認証
- cryptographic signature
- production apply
- Envelope mutation
- Presentation mutation
- Cognitive provider invocation
- fill telemetry / external XLSX evaluation

Authority実装との実際の接続は、別Issueで扱う。
