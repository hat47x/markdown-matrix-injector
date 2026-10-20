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
| `review` | 見直し記録の状態。現在は`not-configured`（#522待ち） |
| `diagnostics` | `mmi check`と同じ診断（参照の誤り、原本の欠落等） |
| `summary` | Linked件数、Extracted件数、診断件数、stale件数、原本なし件数 |

Linkedの解決状態は`resolved`・`missing`・`outside-root`です。Extractedの鮮度は`fresh`・`stale`・`missing`・`untracked`・`unknown`です。`stale`は採用した内容が現在の原本と一致しないことを示し、自動で採用を更新しません。

## 報告に含めないもの

- 原本のセル値、表の内容、コメント本文、本文の文章。
- 参照の自動修正、台帳の自動更新、採用の自動やり直し。
- Linked参照の「書き手が確かめた論理表ダイジェスト」（#522で扱う）。`review`が`not-configured`の間は、報告を「見直し済み」と解釈しないでください。

## 契約

JSONは`mmi.provenance-report/v1`です。機械可読な契約は次で取得できます。

```sh
mmi schema provenance-report
```

契約の設計判断は[ADR-0028](../01_Plans/adr/ADR-0028-per-document-provenance-report-contract.md)に記録しています。

## 終了コード

`provenance`は報告を返すコマンドであり、マージ可否のゲートではありません。診断があっても終了コードは0です。CIで失敗させたい場合は、`--json`の`summary.diagnostics`や`summary.stale`を利用者側で判定するか、既存の`mmi check`・`mmi detach-check`を使います。

## 検証状況

- 自動テスト: Linkedの解決・missing・outside-root、Extractedのfresh/stale、台帳の出力・変換条件、診断件数、公開Schema、CLIのJSON／Markdown出力を確認。
- 未確認: 実在の業務設計書での通し確認、VS Codeレビュー画面・AIエージェントからの利用、macOS・Node 20。報告の内容が実務の見直し判断に十分かは、利用者の観測が必要です。
- 関連: Issue #525、#522、#515。
