# Existing Authority Revalidation Adapter v1

## 1. 目的

issue-0143で定義したReceiptは、Authority checkの結果を表すが、checkそのものは実行しない。

本adapterは、MMIにすでに存在する決定論的処理をexperimental orchestrationから呼び出し、最初の `executable-proposal` Receiptを生成する。

productionコードの意味や呼び出し順を変更せず、既存Authority Planeへ「観測窓」を開ける段階である。

## 2. 利用する既存Authority処理

### Parser

`parseEmbedSyntax`

Notation文字列を `EmbedQuery` へ変換する。parse不能ならparser checkをfailedとする。

### Resolver / containment

`resolveSourcePath`

workspace boundary・realpath symlink containmentを含む既存処理をそのまま使う。

`PathContainmentError` は一般的なresolve failureと区別する。

### Preview

既存の:

- Smart Fallback
- card renderer
- table renderer
- embed frame renderer

をread-onlyに実行する。

preview HTMLはReceiptへ保存しない。生成できたかどうかとstable evidence codeだけをReceiptへ残す。

## 3. Workbook境界

今Issueでは `loadWorkbook` をadapter内部から呼ばない。

```text
existing read-only load path
        |
        v
   WorkbookData
        |
        v
Authority Revalidation Adapter
```

理由:

- production loader / xlsx配線を変更しない
- external-XLSX/fill telemetry並行レーンと競合しない
- previewがAuthority rendering処理を通ることだけを先に検証できる

`mode=card` が即時確定する場合はWorkbook不要。

それ以外でWorkbookが必要なのに未供給ならpreviewをfailedとする。

## 4. Source identity

このadapterにおける `sourceDigest` は:

```text
sha256:<lowercase hex SHA-256 of resolved source file bytes>
```

とする。

Envelope側のdigestが別schemeならsource-identity checkはfailedとなる。

source fileはworkspace containmentを通過した後にのみ読み取る。

## 5. Parameter vocabulary validation

Notation v1の `params.schema.json` は現時点でproduction runtime validatorへ接続されていない。

本adapterでは、既知parameterだけについて同じ制約をdeterministicに検証する。

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

P5 forward compatibilityに従い、未知parameterと `x-*` は拒否しない。

これはJSON Schema engineの代替を標準化するものではない。将来production側にcanonical schema validatorが導入された場合は、この局所validatorを置き換える。

## 6. Profile compatibility

Receipt生成時にはEnvelopeを信頼し切らず、表示候補とProfile参照を再照合する。

- candidate数 = profile ref数
- 同順位でprototype id = profile id
- featureVersion一致
- sourceProfileId一致
- sourceEvidence集合一致
- approvalReference / baselineSourceDigest非空

novel/no-candidateでは空集合を正常とする。

## 7. Failure propagation

adapterは可能な限り全checkを評価し、Receiptのcheck集合を欠落させない。

上流失敗で後続を安全に評価できない場合は、そのcheckを `failed` とし:

- `*_NOT_VERIFIED`
- `*_UNAVAILABLE`

等のevidence codeを付ける。

`executable-proposal` scopeではnot-applicableを使わない。

## 8. 非責務

- source of truthへのwrite
- Format Profile承認
- Cognitive Judgment承認
- production plugin/extensionへの接続
- Workbook loading
- JSON Schema engine導入
- Receipt issuerの暗号学的認証
- fill telemetry / external-XLSX研究の変更

次段階でproduction load pathとの配線を行う場合も、このadapterが通すAuthority処理を置換せず、薄いwiringに限定する。
