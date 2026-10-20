# HTML複数断片の保存 — 通常失敗を検出・回復する最小PoC v0

- 状態: **Proposed / Draft PR**。実装コードを追加した段階で、ビルド・実行・業務受入は未確認。
- 対応Issue: [#553](https://github.com/hat47x/markdown-matrix-injector/issues/553)
- 前提: 統合済みPR #555（候補・単一保存・計画）とPR #593（読み取り専用プレビュー）。
- 原則: 原本read-only、source digest、断片fingerprint、human reviewと機械的整合性を区別。AIによる自動的な意味受理はしない。

## 1. 利用者の操作

既存`mmi inspect`で候補の`sourceDigest`と、保存対象の`expectedFingerprint`を取得する。既存`html-plan --preview --json`で各断片の移設後HTMLを確認し、その後でのみ**明示的な書込み操作**を呼ぶ。

```json
{
  "sourceDigest": "sha256:<原本全体の64桁digest>",
  "fragments": [
    {
      "id": "overview",
      "output": "docs/overview.html",
      "expectedFingerprint": "sha256:<overview断片の64桁digest>"
    },
    {
      "id": "api",
      "output": "docs/api.html",
      "expectedFingerprint": "sha256:<api断片の64桁digest>"
    }
  ]
}
```

```sh
mmi html-plan project/source.html --root project --plan project/selections.json --json --preview
# 人がプレビューと依存状況を確認した後にのみ明示実行
mmi html-commit project/source.html --root project --plan project/selections.json --commit --json
```

`html-commit`は`--commit`なしでは保存しない。`html-plan`と`--preview`は従来どおりread-onlyのまま。

## 2. 保存時の主な検査

| 段階 | 検証・動作 | 保証を超えること |
| --- | --- | --- |
| 原本検証 | manifestの`sourceDigest`と現在の読み取りbytesを照合。UTF-8のみ。 | 未確認のsource変更を承認したとはみなさない |
| 分割内容 | 既存`html-plan`と`preview`で全ID/fingerprint、アンカー、IDREF、`<base>`、資産・能動要素の阻害を確認 | `readyForReview`をpublish/detach合格にしない |
| 保存先 | workspace内、symlink・既存別内容・出力重複・source/ledger上書きを拒否。既存の同一bytesは再使用 | 全OSでの競合・symlinkの原子的な防止を主張しない |
| 出力生成 | 個々のHTML断片を一時ファイルへ書き、hard linkでcreate-if-absentとして公開。途中でsourceを再照合 | 全ファイルが同時に見えることは保証しない |
| Ledger | 全出力のdigestを含む既存`mmi.ledger/v1`エントリを、既存`recordEntries`で**1回にまとめて更新** | 人の業務意味受理やDetachedの保証ではない |
| 通常失敗 | この操作が新たに公開したファイルだけを取り消し、既存出力は削除しない | クラッシュ、電源断、OS競合、作成した空ディレクトリの全回復は未保証 |

対象はローカル静的HTMLであり、`svg`やMermaid定義は構造に沿って保持するが、描画・視覚同等性を保証しない。CSS依存や外部資産が検出される場合は、既存planが阻害を報告する想定であり、未解決のまま保存しない。

## 3. 非対象・既存契約との境界

- HTMLからMarkdownへの変換、画像/CSS等の独立コピー、動的HTML、任意セレクター・除外条件は今回含めない。
- ターゲットHTMLファイルは正規化された断片であり、納品用HTML・安全なブラウザー配信物として保証しない。
- 単一断片のcontent-addressedな`mmi extract --html-id`は変更しない。
- `mmi html-plan`と`--preview`はread-onlyを維持する。既存のLedger schema、Candidate schema、`mmi.*`記法には変更を加えない。
- MCP #527の初版のread-only範囲を変更しない。追加したwriteコマンドを自動的にMCP公開することはしない。
- `--commit`の明示はファイル保存に対する指示であり、原典情報の業務意味受理を代替しない。

## 4. 反証できる最小テスト

1. 二つのSectionを別ファイルへ出力し、`overview`内の`#api`を`api.html#api`に変更する。元HTMLはbytes不変。Ledgerは二つのCandidate/出力digestを持つ。
2. 同じmanifestで再実行してもファイルが重複せず`unchanged`として扱う。
3. 原本変更、移設対象の不足、既存別内容との衝突、symlink、破損Ledgerは、出力の新規作成前に拒否する。
4. 保存後のLedger lock競合を模した場合、この呼び出しで作成された出力を取り消す。
5. CLIで`--commit`なしの呼び出しを拒否し、明示実行でだけファイルを生成する。
6. 失敗時の挙動に空ディレクトリ残存などの限界があることを記録し、クラッシュ原子性の主張を拒否する。

対応テスト: `test/commitHtmlDecomposition.test.ts`、`test/htmlCommitCli.test.ts`。

## 5. 受入に必要な残証拠

- `npm run build:product`、対象単体テスト、既存`npm test`を**このPRのheadで**実行する。元mainの成功記録を今回の実装に流用しない。
- Windows/異なるfilesystemsのhard link、symlink、directory renameとの競合、障害発生時の部分生成物を検査する。
- 完全性を要する運用では、クラッシュ後のrepairと複数出力・Ledgerの一体的公開の設計判断が必要。
- 出力した断片群から利用者が実際のHTML/印刷・PDFを確認するE2E、および業務意味の受入は別工程。

**結論（現時点）**: 通常のエラーを扱う最小保存経路のコードを追加するが、製品受入・完全な一括移行・クラッシュ原子的保存とは扱わない。
