# MMI Notation Parameter Contract v1

## 1. 位置づけ

`params.schema.json`は、Notation v1のquery parameter（参照記法に付く指定項目）について、machine-readable（プログラムで読み取れる）形式で記述した正本である。

runtime code（実行時の処理）は配布物中のDocumentation JSONに依存しないため、parser層（記法を解析する処理）にも、同じ制約を表す小さなTypeScript metadata（制約定義）を配置する。

両者のdrift（内容のずれ）はsync test（同期を確認するテスト）で検出する。

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

制約の種類は次のとおり。

- enum
- regex pattern
- minimum string length
- unconstrained string

これらに限る。

## 3. Forward compatibility

正本schemaは`additionalProperties=true`（定義外の項目も許可）とする。

したがってvalidator（パラメータ検証処理）はunknown key（既知の一覧にない項目名）を拒否しない。
`x-*`のexperimental namespace（実験用の名前領域）も同様に許容する。

unknown keyを「既知でない」という理由だけでwarning/error（警告・エラー）へ昇格させない。

## 4. URLSearchParams semantics

URL query（URLのパラメータ部分）には、同じkey（項目名）を複数回記述できる。

validatorは`entries()`を記述順に処理し、known parameter（既知の項目）の**全occurrence（出現箇所）**を検証する。

特に`formatColumn`はruntime側で`getAll()`を使用するため、同じ項目の2件目以降も検証対象から除外しない。

このcontract（既存の制約定義）は、keyの重複そのものを禁止しない。
JSON Schemaのobject表現でも、同じkeyの出現回数に関する制約を定義していないためである。

## 5. Validation issue

validation issue（検証で検出した問題）は、次の情報を持つ。

- key
- value
- occurrence (0-based)
- constraint
- message

Authority adapter（検証結果とReceiptを結び付ける処理）は最初のissueをReceipt detail（検証記録の詳細）へ変換する。一方、validator API自体は検出した全issueを返す。

## 6. Sync boundary

同期を確認するtestはJSON Schemaを読み、次の項目をTypeScript contract（実行時側の制約定義）と照合する。

- property集合
- enum
- pattern
- minLength
- additionalProperties=true
- `^x-` patternProperties

schema側に新parameterが追加され、TypeScript contractがまだ更新されていなければtest failure（テスト失敗）となる。

## 7. 非責務

- JSON Schema engine導入
- unknown extensionの意味解釈
- duplicate single-valued parameter禁止
- renderer挙動変更
- URL decoding変更
- Cognitive score / provider判断

新しいNotationの意味や制約を増やすことではなく、既存schemaとruntimeの検証条件が一致する状態をテストで維持することが目的である。
