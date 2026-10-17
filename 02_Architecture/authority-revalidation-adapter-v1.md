# Existing Authority Revalidation Adapter v1

## 1. 目的

issue-0143で定義したReceipt（検証結果を残す記録）は、Authority checkの結果を表すが、checkそのものは実行しない。ここでいうAuthority checkは、記法や参照元などを既存の規則に照らして確かめる処理を指す。

本adapter（既存処理と実験用処理をつなぐ部分）は、MMIにすでにある決定論的処理（同じ条件であれば同じ結果となる処理）をexperimental orchestration（実験用の処理連携）から呼び出し、最初の `executable-proposal`（実行可能な提案）に対するReceiptを生成する。

本段階では、productionコード（実運用向けの既存コード）の意味や呼び出し順を変更せず、既存Authority Plane（検証を担う処理層）の挙動を観測できるようにする。

## 2. 利用する既存Authority処理

### Parser

`parseEmbedSyntax`

Notation文字列（MMIの参照記法）を `EmbedQuery` に変換する。構文を解釈できなければ、parser checkをfailedとする。

### Resolver / containment

`resolveSourcePath`

workspace boundary（ワークスペースの境界）とrealpath symlink containment（シンボリックリンクの実体パスも含めて参照先が許可範囲内かを確かめる処理）を含む、既存の解決処理をそのまま使う。

`PathContainmentError`（参照先の範囲制約に関するエラー）は、一般的なresolve failure（参照先の解決失敗）と区別する。

### Preview

プレビュー（書き込みを伴わない表示確認）には、次の既存処理を使う。

- Smart Fallback
- card renderer
- table renderer
- embed frame renderer

これらをread-only（元データを書き換えない方法）で実行する。

生成したpreview HTMLはReceiptに保存しない。生成できたかどうかとstable evidence code（検証結果を機械的に識別する固定コード）だけをReceiptに残す。

## 3. Workbook境界

このIssueでは、adapter内部から `loadWorkbook`（Workbookを読み込む処理）を呼ばない。

```text
existing read-only load path
        |
        v
   WorkbookData
        |
        v
Authority Revalidation Adapter
```

理由は次のとおりです。

- production loader / xlsx配線を変更しない
- external-XLSX/fill telemetry並行レーンと競合しない
- previewがAuthority rendering処理を通ることだけを先に検証できる

`mode=card` が即時確定する場合は、Workbookを必要としない。

それ以外でWorkbookが必要なのに渡されていない場合は、previewをfailedとする。

## 4. Source identity

このadapterで使う `sourceDigest`（参照元のファイル内容を照合するための値）は、次の形式とする。

```text
sha256:<lowercase hex SHA-256 of resolved source file bytes>
```

とする。

Envelope（認知結果と検証要求を束ねる情報）側のdigestが別scheme（計算・表記の方式）である場合、source-identity checkはfailedとなる。

source fileはworkspace containmentを通過した後に限って読み取る。

## 5. Parameter vocabulary validation

Notation v1の `params.schema.json`（パラメータの構造を定義したJSON Schema）は、現時点でproduction runtime validator（実運用時に入力を検証する処理）へ接続されていない。

このadapterでは、既知parameterだけを対象に、同じ制約をdeterministic（決定論的）に検証する。

- mode
- header
- columns
- transpose
- grep
- highlightColumn
- highlightValue
- formatColumn
- caption
- id
- pageBreak
- orientation

P5 forward compatibility（将来のパラメータ追加との互換性に関する規則）に従い、未知parameterと `x-*` は拒否しない。

この局所validatorを、JSON Schema engineの標準的な代替手段とするものではない。将来production側にcanonical schema validator（正規のスキーマ検証器）が導入された場合は、この局所validatorを置き換える。

## 6. Profile compatibility

Receiptを生成するときは、Envelopeをそのまま信用せず、表示候補とProfile参照（対応するProfileへの参照）を改めて照合する。

- candidate数 = profile ref数
- 同順位でprototype id = profile id
- featureVersion一致
- sourceProfileId一致
- sourceEvidence集合一致
- approvalReference / baselineSourceDigest非空

novel/no-candidateでは空集合を正常とする。

## 7. Failure propagation

adapterは可能な限りすべてのcheckを評価し、Receiptに記録するcheckの集合に欠落が生じないようにする。

前段の処理に失敗し、後続のcheckを安全に評価できない場合は、そのcheckを `failed` とし、次のようなコードを付ける。

- `*_NOT_VERIFIED`
- `*_UNAVAILABLE`

これらは、検証できなかった理由を示すevidence codeである。

`executable-proposal` scope（実行可能な提案を検証する区分）ではnot-applicable（検証対象外）を使わない。

## 8. 非責務

- source of truthへのwrite
- Format Profile承認
- Cognitive Judgment承認
- production plugin/extensionへの接続
- Workbook loading
- JSON Schema engine導入
- Receipt issuerの暗号学的認証
- fill telemetry / external-XLSX研究の変更

次段階でproduction load path（実運用の読み込み経路）へ接続する場合も、このadapterを経由するAuthority処理は置き換えない。接続部分は薄いwiring（既存処理をつなぐ最小限の配線）に限定する。
