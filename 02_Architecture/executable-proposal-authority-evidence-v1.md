# Executable Proposal Authority Evidence v1

## 1. 目的

Authority Receipt（決定論的な再検証の記録）は、source（参照元）に対してどのdeterministic checks（規則に基づく確認）が通ったかを表す。

しかし、同じsourceに複数のMMI Notation proposal（記法による適用提案）がある場合、source digest（参照元の内容を照合する値）だけではReceiptとproposalの対応を一意に定められない。

本Evidence wrapper（証拠をまとめる構造）は、issue-0145のAuthority adapter（再検証処理への接続部）を実行する際にproposal identity（提案の識別情報）を生成し、次の情報を

```text
source digest
proposal digest
Authority Receipt
```

一つのevidence unit（証拠のまとまり）として扱う。

## 2. Proposal identity

representation（識別値を求める対象の表現形式）は次のとおり。

```text
mmi-notation-trimmed-utf8-v1
```

識別値は次の手順で求める。

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

parser（記法の解析処理）が入力全体の前後の空白を無視するため、identity（識別値）も同じ扱いに合わせる。

一方、内部の文字列はcanonicalize（表現を一定の形へ正規化）しない。

そのため、次の違いは別のidentityとして扱う。

- query parameter順序差
- `mode=table` と `mode=card`
- grep/caption等の値差
- range / target差

目的は「意味が同じ提案か」を判定することではなく、**検証した具体的なproposal文字列を取り違えないこと**にある。

## 3. Raw Notationを保存しない

Evidenceにはproposalの本文を保持しない。

保持する項目は次のとおり。

- representation id
- algorithm
- digest

これらに限定する。

これにより、grep/caption等に含まれる可能性がある内容を、Evidence artifact（証拠として残すデータ）へ複製しない。

## 4. Evidence generation

`runExecutableProposalAuthorityEvidence`（proposalとAuthorityの証拠を生成する処理）は、次の順序で実行する。

1. issue-0145 `runExecutableProposalAuthorityRevalidation` を同じinputで実行
2. 同じ `rawNotation` からproposal digestを計算
3. Receiptをcopy
4. source digestとproposal identityをEvidenceへ固定

これらを一連の処理として行う。任意の既存Receiptと任意のproposalを後から組み合わせてEvidenceを作るpublic constructor（外部公開の生成手段）は提供しない。

これは、TypeScript object（オブジェクト）の外部からの偽造を防ぐ保証ではなく、正規のAPI（呼び出し口）を使う際の取り違えを防ぐための構造である。

## 5. Binding

`bindExecutableProposalAuthorityEvidence`（Evidenceを現在の提案へ結び付ける処理）は、次の項目を

- Evidence schema version
- proposal representation / algorithm
- Envelope source digest
- Evidence source digest
- Receipt source digest
- Receipt scope=`executable-proposal`
- 現在のrawNotation digest

照合した後、issue-0143の `bindAuthorityRevalidationReceipt`（Receiptの検証・関連付け処理）を再利用する。

返却する情報は次のとおり。

```text
proposal identity
source digest
authority status = satisfied | blocked
authority binding
```

blocked（検証で認められなかった状態）のReceiptも、Evidenceとして保持できる。

「このproposalはAuthorityによって拒否された」という結果も、proposal identityに結び付けた証拠として保持できる。

## 6. 保証しないこと

本Evidenceが行うのはintegrity binding（情報同士の対応と完全性の照合）であり、issuer authentication（記録の発行元が正当かどうかの認証）ではない。

次の事項は保証しない。

- Receipt issuerが本当にtrusted processであること
- semantic-equivalent Notationの同一視
- proposalの人間承認
- source mutation
- automatic apply
- cryptographic signature / MAC

issuer（発行元）の真正性はissue-0143の記載どおり、production boundary（製品の運用・実行境界）で別途扱う。

## 7. 非責務

- production UI配線
- Workbook loading
- provider invocation
- Format Profile更新
- Cognitive score統合
- fill telemetry / external-XLSX研究の変更
