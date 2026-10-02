# MMI Notation Parameter Contract v1

## 1. 位置づけ

`params.schema.json` はNotation v1 query parameterのmachine-readable正本である。

runtime codeは配布物内のDocumentation JSONへ依存しないため、parser層に同じ制約の小さなTypeScript metadataを置く。

このmetadataのdriftはsync testで検出する。

```text
params.schema.json
       |
       | sync test
       v
parameterContract.ts
       |
       +--> Authority adapter
       |
       +--> future diagnostics / editor assistance
```

## 2. Known vocabulary

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

制約種別はは次のとおりです。

- enum
- regex pattern
- minimum string length
- unconstrained string

のみ。

## 3. Forward compatibility

正本schemaは `additionalProperties=true`。

したがってvalidatorはunknown keyを拒否しない。
`x-*` experimental namespaceも同様に許容する。

unknown keyを「knownでない」という理由だけでwarning/errorへ昇格しない。

## 4. URLSearchParams semantics

URL queryは同じkeyを複数回持てる。

validatorは `entries()` を順に処理し、known parameterの**全occurrence**を検証する。

特に `formatColumn` はruntime側で `getAll()` を利用するため、2件目以降も必ず検証対象とする。

このcontractは重複key自体を禁止しない。
JSON Schemaのobject表現も重複回数制約を定義していないためである。

## 5. Validation issue

issueは:

- key
- value
- occurrence (0-based)
- constraint
- message

を持つ。

Authority adapterは最初のissueをReceipt detailへ変換するが、validator API自体は全issueを返す。

## 6. Sync boundary

testはJSON Schemaを読み:

- property集合
- enum
- pattern
- minLength
- additionalProperties=true
- `^x-` patternProperties

をTypeScript contractと照合する。

schema側に新parameterが増えた場合、contract更新前はtest failureとなる。

## 7. 非責務

- JSON Schema engine導入
- unknown extensionの意味解釈
- duplicate single-valued parameter禁止
- renderer挙動変更
- URL decoding変更
- Cognitive score / provider判断

Notation仕様の意味を1箇所増やすのではなく、既存schemaとruntime検証の同期をテストで固定することが目的である。
