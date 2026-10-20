# 文書ごとの出典報告

`mmi provenance`は、一つのMarkdown文書について、Linked参照・取り込んだExtracted資産・鮮度・未解決の診断を一つの報告にまとめます。レビューやCIで「この文書は何に依存しているか」を確認するための読み取り専用の入口です。

```sh
mmi provenance ./docs/basic-design.md
mmi provenance ./docs/basic-design.md --json
mmi provenance ./docs/basic-design.md --ledger mmi-ledger.json --out report.json --json
```

`--root`はワークスペースの境界です。`--ledger`の既定値は`<root>/mmi-ledger.json`です。`--out`を指定した場合だけファイルへ書き出します。

## 報告に含むもの

| 項目 | 内容 |
| --- | --- |
| `document` | 文書のパスと、報告時点の文書ダイジェスト |
| `linked` | 記法上の参照ごとに、解決した原本、シート・範囲、原本ダイジェスト、解決状態 |
| `extracted` | 出典コメントごとに、種別、出典、構造位置、fingerprint、台帳の出力・変換条件・レビュー状態、鮮度 |
| `review` | 参照ごとの、記録済み論理表ダイジェストと現在のダイジェストの比較 |
| `diagnostics` | `mmi check`と同じ診断（参照の誤り、原本の欠落等） |
| `summary` | Linked件数、Extracted件数、診断件数、stale件数、原本なし件数、reviewStale件数、reviewUnrecorded件数 |

Linkedの解決状態は`resolved`・`missing`・`outside-root`です。Extractedの鮮度は`fresh`・`stale`・`missing`・`untracked`・`unknown`です。`stale`は採用した内容が現在の原本と一致しないことを示し、自動で採用を更新しません。`review`の状態は`fresh`・`stale`・`unrecorded`・`unverifiable`です。

## 見直し記録を残す

Linked参照について、書き手が確かめた時点の論理表ダイジェストを、明示的な操作で記録できます。

```sh
# 記録内容の確認（書き込みなし）
mmi review-basis ./docs/basic-design.md --json

# レビュー後に記録する
mmi review-basis ./docs/basic-design.md --write --review-basis mmi-review-basis.json
```

記録は`mmi-review-basis.json`（`mmi.review-basis/v1`）に、文書ごと・参照ごとの論理表ダイジェストとして残ります。`mmi provenance`はこの記録と現在の論理表を比較し、参照範囲内の変更だけを`stale`として示します。参照範囲外だけの変更は`fresh`のままです。

記録は自動で更新されません。原本を読めない参照が1つでもある場合、`review-basis --write`は部分的な記録を書かずに失敗します。未記録の参照は`unrecorded`、読めない参照は`unverifiable`として区別します。

`--write`を付けない`review-basis`はプレビューであり、ファイルを書き換えません。

## 報告に含めないもの

- 原本のセル値、表の内容、コメント本文、本文の文章。
- 参照の自動修正、台帳の自動更新、採用の自動やり直し、見直し記録の自動更新。

## 契約

JSONは`mmi.provenance-report/v1`です。機械可読な契約は次で取得できます。

```sh
mmi schema provenance-report
```

契約の設計判断は[ADR-0028](../01_Plans/adr/ADR-0028-per-document-provenance-report-contract.md)に記録しています。

## 終了コード

`provenance`は報告を返すコマンドであり、マージ可否のゲートではありません。診断があっても終了コードは0です。CIで失敗させたい場合は、`--json`の`summary.diagnostics`や`summary.stale`を利用者側で判定するか、既存の`mmi check`・`mmi detach-check`を使います。

## 検証状況

- 自動テスト: Linkedの解決・missing・outside-root、Extractedのfresh/stale、台帳の出力・変換条件、診断件数、公開Schema、CLIのJSON／Markdown出力、見直し記録のdry-run／明示書き込み、範囲内変更のstale・範囲外変更のfresh、未記録／読めない参照の区別を確認。
- 未確認: 実在の業務設計書での通し確認、VS Codeレビュー画面・AIエージェントからの利用、macOS・Node 20。報告の内容が実務の見直し判断に十分かは、利用者の観測が必要です。
- 記録の置き場所（別ファイル）は暫定です。記法へ書くかはHuman Sponsorの判断を仰ぎます（#522のRemaining work）。
- 関連: Issue #525、#522、#515。
