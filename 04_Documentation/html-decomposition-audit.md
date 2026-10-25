# HTML分割後の整合性を確認する（CLI）

巨大なHTML設計書から複数の断片を独立ファイルにした後、**原本・保存先・取り込み台帳の対応関係**を読み取り専用で再確認できます。分割方法を選ぶ機能と、ファイルの修復を行う機能は区別します。

この機能は静的なローカルHTMLの明示ID断片を対象としたPoCです。HTMLの配信安全性、CSSや画像の依存閉包、レンダリングの忠実度、顧客納品文書の受入、Detached状態を判定するものではありません。

## 操作

既存の`mmi inspect`で原本全体のsource digestと各断片のfingerprintを確認し、`html-plan --preview --json`で分割後の候補と参照関係をレビューします。

保存時に使用した承認済みの計画ファイルを**そのまま**監査に使用します。

```json
{
  "sourceDigest": "sha256:<原本全体の64桁digest>",
  "fragments": [
    {"id": "overview", "expectedFingerprint": "sha256:<断片の64桁digest>", "output": "docs/overview.html"},
    {"id": "api", "expectedFingerprint": "sha256:<断片の64桁digest>", "output": "docs/api.html"}
  ]
}
```

```sh
# 明示的な書き込みは既存の保存操作のみ
mmi html-commit project/source.html --root project --plan project/reviewed.json --commit --json

# 保存後の読み取り専用監査
mmi html-audit project/source.html --root project --plan project/reviewed.json --json
# --ledger <file> は既存のhtml-commitと同じ場所を指定。省略時は<root>/mmi-ledger.json

# 人が読む形式での表示（--jsonを省略）
mmi html-audit project/source.html --root project --plan project/reviewed.json
```

`html-audit`は、原本・出力・Ledgerを一切書き換えません。**監査用ファイルを作成したり、Ledgerを自動生成したりもしません**。`--commit`、`--write`、`--out`を監査に指定することはできません。

### 出力例

保存が正常な場合：

```json
{
  "status": "complete",
  "sourceDigest": "sha256:<原本Digest>",
  "files": [
    {"id": "overview", "output": "docs/overview.html", "expectedDigest": "sha256:<出力Digest>", "file": "matching", "ledger": "matching"},
    {"id": "api", "output": "docs/api.html", "expectedDigest": "sha256:<出力Digest>", "file": "matching", "ledger": "matching"}
  ],
  "problems": [],
  "consistentAtObservation": true
}
```

`<...>`は説明用プレースホルダーです。実際のDigestはCLIが出力した値で確認してください。

## 判定結果と対処

| `status` | 意味 | 次に確認すること |
| --- | --- | --- |
| `complete` | 指定した原本・断片・出力・Ledgerが監査時点で一致 | 実ブラウザー、表示、参照資産、納品文書としての受入は別途確認 |
| `incomplete` | 出力またはLedgerに欠落・変更・破損・安全でないパスがある | 人が変更経緯を調べる。自動上書きや自動削除を行わない |
| `stale` | 原本の現在のbytesがレビュー済み原本Digestと異なる | 現在の原本と分割計画を再レビュー |
| `blocked` | 分割計画に未解決の内部参照や資産依存などがある | 分割範囲・リンク・依存資産を確認 |

`files[].file`は`matching / missing / changed / unsafe`、`files[].ledger`は`matching / missing / changed / invalid`です。`problems`には`MMI_HTML_OUTPUT_MISSING`や`MMI_HTML_LEDGER_CHANGED`など、検出された診断コードが入ります。

終了コードは、**機械的に`complete`なら0、それ以外や操作エラーなら非0**です。CIや生成AIが呼び出す際も、単にファイルが存在するという理由で成功と判定しないでください。

## 回復と受入の境界

監査は出力ファイルとLedgerを**同時にロックしません**。`complete`は一時点の観測であり、クラッシュ・プロセス強制終了・電源断時の一括保存を保証するものではありません。

`incomplete`からの修復は、人が欠落か改変かを判断し、必要なら同じsource digestとfingerprintで再実行の適否を決めます。出力が書き換えられている場合は既存のno-overwriteを尊重し、元のファイルを保存したうえで差分を確認してください。

本操作は、既存のread-only MCPの機能範囲も変更しません。CLIの監査機能と、将来の製品UIからの表示は別途受入が必要です。

より詳細な設計・検証の限界は[HTML分割後監査の設計](../02_Architecture/html-decomposition-audit-v0.md)を参照してください。
