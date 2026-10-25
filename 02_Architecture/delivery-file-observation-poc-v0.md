# 納品構成MarkdownからのExcelファイル参照観測 PoC v0

- 区分：Issue [#658](https://github.com/hat47x/markdown-matrix-injector/issues/658) の実装試作と受入用メモ
- 範囲：単一のMarkdown本文に書かれた **シート・範囲を指定しないExcelへのMMI参照**
- 実装：`03_Implement/src/application/deliveryFileObservation.ts` の `observeDeliveryFiles`
- テスト：`03_Implement/test/deliveryFileObservation.test.ts`
- 公開契約：**未採用**。CLI／VS Codeコマンド／既存 `mmi manifest` の挙動は変更しない

## 最小利用例

```markdown
# 納品構成
## 基本設計
![[./excel/screen-design.xlsx]]
![[./excel/data-design.xlsx]]
## 試験
![[./excel/test-cases.xlsx]]
```

この記述から、元のMMIパーサーでファイル単位のExcel参照を取り出す。原本を表へ変換せず、Markdown見出しと行番号、参照文字列、Workspace相対パス、存在状態、読み取り可能な場合はsource digestを観測する。

### 取り扱う差異

| 観測結果 | 意味 |
| --- | --- |
| `resolved` | 参照先がWorkspace内にある通常ファイルで、bytesのdigestを取得できた |
| `missing` | 参照先が解決できなかった |
| `outside-workspace` | 許可境界外への参照または既存のsymlink経由の境界外 |
| `not-file` | 参照先がディレクトリ等だった |
| `unreadable` | 権限不足・読込み失敗等により正本bytesを確認できなかった |
| `duplicateOfLine` | 同じ実ファイルへの再参照があった |
| `sameContentAsLine` | 所在の異なるファイルが同じsource bytesだった |

`referentialCompleteness` は参照先が全て `resolved` かだけを表し、`empty`／`complete`／`incomplete` を区別する。**`complete` は契約成果物の網羅性、依存資産を含む納品パッケージの閉包、原本の意味・実形式の検証、検収済み納品版の再現性を意味しない。**

## 実装上の分離

- 既存の `extractEmbedQueries`、`resolveSourcePath`、`readSourceFileIdentity` を再利用する。
- `![[./a.xlsx#Sheet1|A1:B5]]` のような部分表の埋込み、普通のMarkdownリンク、非Excelへの参照、コードフェンス内の例示は、この試作の納品対象候補には加えない。
- 原本を書き換えず、ディレクトリ全体の走査もしない。指定フォルダーの実ファイル集合との比較は既存 [#620](https://github.com/hat47x/markdown-matrix-injector/issues/620) の目録機構との接続を検討する。
- `manifest` はカード扱いの別紙一覧、`check` は既存の参照診断、`provenance` は出典と鮮度、`detach-check` はDetached資産の確認を担う。**本PoCの観測結果でこれらの意味を再定義しない。**
- source digestの取得は観測時点のファイル読取りであり、読み取り途中のファイル置換・巨大ファイルのメモリ消費・本番のTOCTOU保証は未検証。大規模な実利用や企業セキュリティの受入前に境界と資源上限を再評価する。
- Markdownの見出しとコードフェンスの識別はPoC向けの限定的な処理。将来の入れ子Markdown、任意リンク、複雑なMarkdown構文への適合性は検証対象。

## この縦切りから次へ

1. 少数の実務相当Excel参照で出力を確認し、欠落・境界違反・重複・原本非改変の負例を試す。
2. 構文・原本・集合のどの単位で検査する必要があるかを利用者と確認する。
3. #620 の資料目録と結合し、「宣言にあるが見つからない」「配置されているが宣言にない」を区別する。ただし納品対象指定の意味と普通の参考リンクは同じとは限らない。
4. 継続的リファクタリングで必要となる変換前後の対応と、検収済み納品版の保存・再現性を別に検証する。
5. 実務観測は [#524](https://github.com/hat47x/markdown-matrix-injector/issues/524) へ接続する。

本メモは正式な仕様・受入済み機能・Wails本流製品の実装完了を主張するものではない。
