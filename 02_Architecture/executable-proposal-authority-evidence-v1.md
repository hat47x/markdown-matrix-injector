# Executable Proposal Authority Evidence v1

## 1. 目的

Authority Receiptは「sourceに対してどのdeterministic checksが通ったか」を表す。

しかし同一sourceに複数のMMI Notation proposalが存在する場合、source digestだけではReceiptとproposalの対応を一意にできない。

本Evidence wrapperは、issue-0145のAuthority adapter実行と同時にproposal identityを生成し:

```text
source digest
proposal digest
Authority Receipt
```

を一つのevidence unitとして扱う。

## 2. Proposal identity

representation:

```text
mmi-notation-trimmed-utf8-v1
```

計算:

```text
trim leading/trailing whitespace
        |
        v
UTF-8 string
        |
        v
SHA-256
        |
        v
sha256:<lowercase hex>
```

parserが入力全体の前後空白を無視するため、identityも同じ境界へ合わせる。

一方、内部表現はcanonicalizeしない。

次は別identityとなる。

- query parameter順序差
- `mode=table` と `mode=card`
- grep/caption等の値差
- range / target差

これは「意味的同値判定」ではなく、**検証した具体的proposal文字列の取り違え防止**を目的とするためである。

## 3. Raw Notationを保存しない

Evidenceにはproposal本文を保持しない。

保持するのは:

- representation id
- algorithm
- digest

のみ。

これによりgrep/caption等に含まれうる内容をEvidence artifactへ複製しない。

## 4. Evidence generation

`runExecutableProposalAuthorityEvidence` は:

1. issue-0145 `runExecutableProposalAuthorityRevalidation` を同じinputで実行
2. 同じ `rawNotation` からproposal digestを計算
3. Receiptをcopy
4. source digestとproposal identityをEvidenceへ固定

する。

任意の既存Receiptと任意proposalを後から組み合わせてEvidenceを作るpublic constructorは提供しない。

TypeScript objectを外部から偽造できないという意味ではなく、正規API経路で取り違えを起こさないための構造である。

## 5. Binding

`bindExecutableProposalAuthorityEvidence` は:

- Evidence schema version
- proposal representation / algorithm
- Envelope source digest
- Evidence source digest
- Receipt source digest
- Receipt scope=`executable-proposal`
- 現在のrawNotation digest

を照合した後、issue-0143 `bindAuthorityRevalidationReceipt` を再利用する。

返却:

```text
proposal identity
source digest
authority status = satisfied | blocked
authority binding
```

blocked ReceiptもEvidenceとして有効である。

「このproposalはAuthorityによって拒否された」という証拠も、proposal identityへ結び付けて保持できる。

## 6. 保証しないこと

本Evidenceはintegrity bindingであり、issuer authenticationではない。

保証しない:

- Receipt issuerが本当にtrusted processであること
- semantic-equivalent Notationの同一視
- proposalの人間承認
- source mutation
- automatic apply
- cryptographic signature / MAC

issuer真正性はissue-0143記載どおり、production boundaryで別途扱う。

## 7. 非責務

- production UI配線
- Workbook loading
- provider invocation
- Format Profile更新
- Cognitive score統合
- fill telemetry / external-XLSX研究の変更
