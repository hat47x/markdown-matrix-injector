# 納品構成MarkdownとExcelファイル目録の照合（PoC）

この機能は [Issue #658](https://github.com/hat47x/markdown-matrix-injector/issues/658) の実務評価用試作です。Excel原本とMarkdownを読み取って比較します。**参照したExcelが揃うことは、契約で必要とされた納品物がすべて揃うことを意味しません。**

## 使い方

例：Workspace `project/` の `docs/delivery.md` に、次のような納品構成を書く。

```markdown
# 納品構成
## 基本設計
![[../excel/screen-design.xlsx]]
![[../excel/data-design.xlsx]]
```

Workspace内で以下を実行する。

```sh
mmi delivery-audit ./docs/delivery.md ./excel --root . --json
```

読み取り専用です。JSONを標準出力に返し、ファイルは作成・更新しません。明示的な `--root` と `--json` が必要です。`-o / --out` は受け付けません。`--max-bytes N` で資料目録の1ファイル当たりのバイト上限を設定できます（既定は16MiB）。`--inspect`／`--exclude` はこのPoCコマンドでは扱いません。

| 終了コード | 意味 |
| --- | --- |
| 0 | 対象範囲内の二つの観測集合に差分が検出されなかった（`alignment=aligned`） |
| 1 | 差分がある、または観測不足で確定できない（`differences` / `indeterminate`） |
| 2 | 引数・入力・境界などの実行エラー |

主な結果：

- `delivery`：Markdown中のシート・範囲を指定しないExcel全体へのMMI参照の観測結果。行番号・見出し・resolved / missing / outside-workspace等。
- `inventory`：既存`mmi.source-inventory/v0`。実際に指定フォルダー内で識別できたファイル、除外・失敗、バイトdigest、collectionDigest等。
- `comparison`：二観測のパス・digest・範囲を突合。`matched`、`reference-missing`、`inventory-unreferenced`、`inventory-unverifiable`、`digest-mismatch`等。
- `consistency=independent-observations`：一斉時点のスナップショットを保証せず、二つの観測を比較する。

シート・範囲の埋め込み、通常のMarkdownリンク、Excel以外の資料は自動的な納品物指定と扱いません。ディレクトリに存在する未参照Excelは**納品漏れ候補**であって、契約必須と確定したものではありません。納品対象の判断は利用者に残ります。

## 検証証拠と限界

専用テストでは、実際のOOXML構造を持つ小さなXLSXを16件生成し、正常、未列挙、参照切れ、重複、同内容別所在、サイズによる除外、対象範囲の違い、空宣言、Workspace外参照、原本非改変を検証します。テスト用のWorkbookは生成物であり、実案件のExcel設計書や検収記録ではありません。

これは複数の既存Application関数を組み合わせるPoCで、恒久的な公開API・納品承認ルールとしての受理は行っていません。原本バイトを読み取る`observeDeliveryFiles`側の容量上限、観測中の更新、Markdown一般構文の完全解析、シンボリックリンク等の競合状態、納品版資産の固定・再現性、Excel固有の意味の理解は追加評価を要します。

**検収済み納品可能版**を管理する場合は、原本・付帯資産・出力成果物・使用した条件・検査記録を含めて固定できるかを別途検証します。作業中のWorking Treeと最後の検収版を区別する必要があります。

既存の`mmi manifest`（別紙カード）／`mmi check`（参照診断）／`mmi inventory`（ファイル集合の目録）の挙動は変更しません。
