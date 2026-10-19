# HTML分解のプレビューとリンク再配置（PoC v0）

- 状態: **Proposed / Draft PR**。実行試験と製品受入は未確認。
- 対応Issue: [#553](https://github.com/hat47x/markdown-matrix-injector/issues/553)
- 前段: [HTML断片分解の設計境界](html-fragment-decomposition-v0.md)、merged [PR #555](https://github.com/hat47x/markdown-matrix-injector/pull/555)（2026-10-17）
- 目的: 既存の`mmi html-plan`で識別された、独立文書へ移す場合のリンクの変更案について、**実際のHTML5断片に適用した見え方を保存前に確認する**。

## 1. 追加する最小機能

原本HTMLの`#overview`と`#api`を別々のファイルへ分離する計画で、`href="#api"`の書換え先が`api.html#api`であると判定できることは、PR #555で確認された。

本PoCでは、次のように**読み取り専用のプレビュー**を返す。

```sh
mmi inspect project/source.html --root project --json
# inspect結果のFingerprintを確認してselections.jsonに設定する
mmi html-plan project/source.html \
  --root project --plan project/selections.json \
  --json --preview
```

- `--preview`は`html-plan --json`にのみ追加する任意オプションで、通常の`html-plan`結果は変更しない。
- JSONには`plan`（従来の根拠・未解決依存）、`files`（プレビューの相対出力パス、断片ID、正規化HTML本文、出力SHA-256、書換え件数）、`readyForReview`を含める。
- 実ファイル、原本、Ledgerを変更しない。出力パスは*予定*であり、既存ファイルの保護や原子保存が実行されたという意味ではない。
- `html-plan`がblockerを検出した場合、`files=[]`、`readyForReview=false`。部分的なプレビューを完成見込みとして返さない。
- `sourceDigest`と各断片fingerprintは既存のplanから取得し、出力digestと混同しない。

## 2. 書換え対象の限定

| 操作 | 今回の振る舞い |
| --- | --- |
| HTMLの`<a href="#...">` | 対象IDが計画内の別ファイルに一意にある場合だけ相対リンクへ変換 |
| 同じ出力先内のアンカー | `href="#..."`をそのまま維持 |
| `<a href="https://...">` | 参照文字列を保存し、外部取得しない |
| SVGやHTML以外の`href`・`xlink:href` | 通常のHTMLリンクと同一視せず、書換えが必要なら停止 |
| 元HTMLの`<base>` | 既存計画の阻害として停止 |
| 別ファイルへ跨る`aria-labelledby`等IDREF | 既存計画の阻害として停止 |
| 画像・CSS・script依存、未解決アンカー | 既存計画で既知の阻害があればプレビュー本文なし |

リンクの書換え件数と、従来planの変更対象件数が一致しなければ、プレビューを返さない。DOMの解析・シリアライズには既存の`parse5`を利用し、文字列置換のみでHTML構造を書き換えない。

## 3. 受入観点と反証

- 2断片のfixtureでは、`overview`から`api`へのリンクが`api.html#api`となり、元HTML・Candidateを変更しない。
- 異なるディレクトリのプランでは、相対パスがその配置に応じて変わる。
- 外部HTTP(S)リンク、figureとfigcaption、表の内容、Mermaid定義を勝手に書き換えない。
- 未解決参照・画像等のdependencyがある場合は本文を一切返さず、blockerを表示する。
- レビュー後に原本を改変するとfingerprintが合わず停止する。
- SVG要素のリンクをHTMLナビゲーションと取り違えた場合は停止する。
- CLIオプションを省略した既存のJSON契約・exit codeは変更しない。

テスト対象: `test/htmlDecompositionPreview.test.ts`、`test/htmlDecompositionPlanCli.test.ts`。本書を追加したこと自体はテスト合格ではない。

## 4. 未保証・次段の判断

出力は**正規化HTMLの構造プレビュー**であり、完全なHTMLページ、任意HTMLの安全な表示物、PDFの再現、CSSの依存閉包、HTML→Markdownの意味同等性ではない。とくに`readyForReview=true`は**完成・納品可能**という意味ではない。

保存を伴う複数ファイル移行には、変更後のsource snapshotの再確認、保存先競合の防止、参照依存の再検証、生成物とLedgerの失敗回復、Windows等での実行試験が別途必要となる。これらを今回のプレビューの成功判定に混同しない。

2026-10-17のPR #555で確認されたLinux / Node.js 20.20.2のbuild:product、npm test、単独配布CLIのoffline smokeは**PR #555時点の証拠**であり、この後続PRの新しい`--preview`が実行試験済みであることを意味しない。
