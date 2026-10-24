# MMI参照集合と資料目録の比較 PoC v0

- 位置づけ：[#658](https://github.com/hat47x/markdown-matrix-injector/issues/658) の第二縦切り
- 依存：ファイル参照観測 [Draft PR #662](https://github.com/hat47x/markdown-matrix-injector/pull/662)、資料目録 [Draft PR #621](https://github.com/hat47x/markdown-matrix-injector/pull/621)
- コード：`03_Implement/src/application/compareDeliveryFileInventory.ts`
- 契約：`mmi.delivery-inventory-comparison/v0` はPoC内部の比較結果。公開CLI/Notationの契約ではない

## 目的

納品構成Markdownに **宣言されたExcel参照の集合** と、特定フォルダーに **実在する資料を走査した集合** の差を、原本非改変で確認する。

第一縦切りはMarkdownを読み、参照行、章見出し、ファイルの解決、digestを観測する。第二縦切りは、#620／PR #621が提案する`mmi.source-inventory/v0`形式のうち、scope・status・相対パス・状態・digestのみを取り込み、**ファイルを二重走査しない**。

PR #621が未マージなので、比較関数はそのJSON構造の最小投影を受け取る。正式にマージされたら型と挙動を改めて照合する。現在は双方の結果を同一処理で収集する公開コマンドを追加しない。

## 比較の読み方

| 関係 | 意味 |
| --- | --- |
| `matched` | 文書参照・目録で、パスとdigestが一致した |
| `reference-missing` | 文書の指定ファイルが見つからない |
| `reference-blocked` | Workspace外・ディレクトリ等で参照できない |
| `reference-unreadable` | 文書側で正常なバイト識別ができない |
| `reference-outside-inventory-scope` | 参照先は実在するが、今回の目録対象フォルダーの外 |
| `reference-not-in-inventory` | 実在する参照先が今回の目録に現れない |
| `inventory-unverifiable` | 目録で除外・失敗・変更・digestなしなどにより確認できない |
| `digest-mismatch` | ファイルのパスは対応するが、観測したバイト列が異なる |
| `inventory-unreferenced` | 目録で識別したExcelファイルに、対象Markdownからの全体ファイル参照が見つからない |

`alignment=aligned` は、**この二つの独立した観測結果の範囲内で差分が見つからなかった**ことを表す。`differences` は確認された差、`indeterminate` は範囲外参照・未解析・空集合・一部未完などを表す。納品対象の指定そのものの妥当性、参考リンクと必須納品物の区別、契約で要求される文書の充足、納品パッケージの資産閉包、変更時点の同時性や実務受入までは含まない。

二つの入力の観測時点が異なり得るため、`consistency=independent-observations`とする。失効が疑われる場合は同条件で再観測する。検収済み納品版を別途確保する要件は継続検討する。

## 実装境界

- 対象はExcelファイル全体のMMI埋め込み参照のみ。明示したSheet/Range、通常Markdownリンク、Excel以外のファイルは別の検証テーマに残す。
- #620のディレクトリ走査・除外規則・容量上限・Source Identityの実装は再利用する設計であり、このPoC内に第二スキャナーを設けない。
- 文書に書かれていないExcelが存在しても、ただちに納品漏れとは判定せず、`inventory-unreferenced`として確認候補を出す。
- 既存の`mmi manifest`、`check`、`provenance`、`detach-check`の意味は変更しない。
- 原本自体の実形式、巨大ファイル読取り上限、TOCTOU、参照先の中にある関連資産、Gitの版固定、顧客検収版は別途実証を要する。

## 次の検証

1. #662と#621の型・試験・CIが個別に成立することを確認する。
2. 10〜20件程度の資料集合で、正常・未列挙・欠落・対象外・除外・失効の実測を行う。
3. フォルダー以外に散在する納品対象をどう宣言するか、参考情報と正式納品対象をどう区別するかを、人の業務判断として検討する。
4. 必要性が実証されてから共通Application入口とCLI/VS Code表示を選び、公開契約へ昇格するか決める。
