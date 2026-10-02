---
name: mmi
description: >
  Excel・CSV・TSV・XML Spreadsheet 2003の表を、Markdownの設計書へ写さずにMMI参照（![[...]]）で載せる。
  設計書・仕様書・試験書などで表を扱うとき、正本のExcel/CSVを参照して章を書くとき、
  mmi inspect / check / render を使うとき、`![[...]]`を含むMarkdownを編集するときに使う。
---

# MMI: 表は写さず、正本を参照する

MMIの参照は、Excel・CSVなどの正本から必要な表だけをMarkdownへ描く。表の値は正本から描かれるため、転記誤りと更新漏れが起きない。

## 必ず守ること

- 表の値を本文へ写さない。 正本にある表は`![[...]]`で参照する。Markdownの表を手で書いてよいのは、正本が存在しない表だけ。
- 正本を編集しない。 Excel・CSVを書き換えたり、作り直したりしない。正本に誤りがあれば、利用者に報告する。
- 推測で参照を書かない。 先に`mmi inspect`でシート名・範囲・見出しを確かめる。
- `mmi check`がエラー0件になるまで直す。 エラーが残ったまま完了と報告しない。
- 記法で表せない依頼を言い換えない。 集計・計算・複数条件の絞り込みはMMIではできない。正本側で集計シートを作るよう提案するか、できないと報告する。`grep`は部分一致の絞り込みにすぎない。
- 画像の中身を推測で文章にしない。 Excelの画像は`mmi inspect`が番号・位置・近くの表を示す。取り込む必要があるときだけ`mmi extract <ブック> --image <番号>`で`assets/`へ書き出し、出力された画像参照と`<!-- mmi:extracted ... -->`の出典コメントをそのまま文書へ置く。画像に何が写っているかは、見ていない限り書かない。EMFなど取り出せない画像は、その旨を利用者へ報告する。
- 正本の値を必要以上にAIへ渡さない。 `inspect`は既定で構造だけを返す。値が必要なときだけ`--values`を使い、利用者の組織の規則に従う。

## 作業の順序

1. 目録を見る。
   ```sh
   mmi inspect masters/設計.xlsx --from docs/基本設計書.md
   ```
   シートごとの表の範囲、見出し、行数と、そのまま使える参照の例が出る。`--from`で書き込む文書を指定すると、参照のパスがその文書からの相対パスになる。`--json`で機械可読になる。
2. 参照を書く。 本文を起案し、表は参照で置く。必要な列と行だけに絞る。
3. 検証する。
   ```sh
   mmi check docs/
   ```
   `ファイル:行:列 error コード メッセージ`の形で出る。終了コードは、エラーがあれば1。
4. 読み戻す。
   ```sh
   mmi render docs/基本設計書.md
   ```
   参照を展開したMarkdownが出る。本文の主張（「承認できるのは承認者のみ」など）が表と矛盾しないか確かめる。
5. 報告する。 使った正本、参照した範囲、`check`の結果、本文と表の確認結果を利用者に伝える。

`mmi`は配布されたCLI tarballをNode.js 20以上の環境へ導入して使う。開発用checkoutで作業していて配布CLIが無い場合だけ、MMIリポジトリの`03_Implement`で`npm run mmi -- <command> ...`を使う。

## 外部LLMへ相談する（MMIは送信しない）

判断が曖昧で外部LLMへ相談したい場合は、原本をそのまま渡す前にhandoff packageを作る。

```sh
mmi handoff masters/設計.xlsx \
  --task "この設計書で使うMMI参照案を提案する" \
  --document docs/基本設計書.md \
  --root .
```

既定出力は人がコピーして利用者の選んだLLMへ渡すpromptである。MMI自身は送信、ログイン、API keyの利用、課金サービスへのfallbackを行わない。機械可読なpackageが必要なら`--json`を付ける。

既定ではCandidateのClaim値とEvidence詳細をpackageへ含めない。値が本当に必要で、利用者の組織の規則上も許される場合だけ`--include-values`を明示する。この指定でも原本全体を全文投入するのではなく、Candidateが持つClaim値だけが追加される。promptにはCandidate identityが表示されるため、値を含めなくてもCandidate選択案と変換案は同じ候補を指定できる。Candidate v1の`confirmed`は採用済みの互換表現として扱い、`observed`と同じ原本事実にはしない。

handoffの返答は**提案**であって確定結果ではない。MMI記法が返ってきた場合は、handoff packageをJSONで保存し、ローカルで再検証する。

```sh
mmi handoff masters/設計.xlsx \
  --task "この設計書で使うMMI参照案を提案する" \
  --document docs/基本設計書.md \
  --root . --json -o handoff.json

mmi validate-proposal '![[../masters/設計.xlsx#画面一覧|A1:F13?header=first]]' \
  --package handoff.json \
  --document docs/基本設計書.md \
  --root .
```

`validate-proposal`はparser、parameter schema、handoff時のsource allowlist、resolver / containment / source existence / sheet existence、read-only preview、source digestを確認し、すべて通ったときだけ終了コード0になる。存在しないsheet、URL・workspace外path、`aggregate=sum`のような未対応parameter、自由文や任意コマンドは拒否する。検証が通ってもMMIは文書へ自動適用しない。

Candidate選択案と変換案もJSONで受け取り、ローカルで再検証する。

```sh
mmi validate-selection selection.json \
  --package handoff.json \
  --root .

mmi validate-transformation transformation.json \
  --package handoff.json \
  --document docs/基本設計書.md \
  --root .
```

`validate-selection`はhandoffに提示したCandidate identityだけを受け入れ、AIの選択を`observed`や`confirmed`へ昇格させない。`validate-transformation`はcurrent sourceからCandidateを再発見し、source digestとprovenanceを再確認する。LinkedはMMIが再生成したreferenceを既存Authority経路へ通し、Extractedは表の`gfm-table-v1`または画像の`raw-image-bytes-v1`だけをreview planとして返す。どちらもfileやreview stateを自動変更しない。


## 記法

```md
![[<パス>#<シート>|<範囲>?<パラメータ>]]
```

- パスは参照元の文書からの相対パス。ワークスペースの外、URLは参照できない。
- シート名は必ず書く。CSV・TSVのシート名は`Sheet1`。シート名を省くと表にならず別紙カードになる。
- 範囲はA1形式（`A1:F13`）。`inspect`が示した範囲を使う。
- 参照は1行に1つ、前後を空行にする。Markdownの表の中には置かない（`|`が衝突する）。

| パラメータ | 意味 | 例 |
| --- | --- | --- |
| `header` | 見出し行。`first`、行番号、`none` | `header=first` |
| `columns` | 表示する列（原本の列記号） | `columns=A,C,F` |
| `grep` | いずれかのセルに部分一致する行だけ（大文字小文字を区別しない） | `grep=要確認` |
| `transpose` | 行と列を入れ替える | `transpose=true` |
| `caption` | 表題 | `caption=表4-1　役割別の権限` |
| `id` | 相互参照用のID | `id=permissions` |
| `highlightColumn`・`highlightValue` | 一致する行を強調する | `highlightColumn=状態&highlightValue=要確認` |
| `formatColumn` | 列をコード表示にする | `formatColumn=E:json` |
| `mode` | `table`または`card`（別紙） | `mode=card` |
| `pageBreak`・`orientation` | 印刷時の改ページ・用紙の向き | `pageBreak=before&orientation=landscape` |

処理の順序は「範囲 → columns → transpose → header → grep」。`columns`は見出し名ではなく列記号で指定する。
`grep`は`columns`で残した列だけを探す。 絞り込みに使う語を含む列（画面IDなど）を`columns`で落とすと、表が空になる。`render`で行が出ているか必ず確かめる。
列が10を超える、またはセルが500を超える表は、自動で別紙カードになる。必要な列と行だけに絞るか、別紙として扱う。

例は次のとおりです。

```md
承認者が操作できる範囲を表4-2に示す。

![[../masters/設計.xlsx#権限|A1:F13?header=first&columns=A,B,D&caption=表4-2　承認者の操作]]
```

## 診断コード

| コード | 意味 | 直し方 |
| --- | --- | --- |
| `MMI_FILE_NOT_FOUND` | ファイルが無い | パスを参照元の文書からの相対で直す。`inspect`の`--from`を使う |
| `MMI_PATH_OUTSIDE_BOUNDARY` | ワークスペースの外 | ワークスペース内の正本を使う。外の正本は利用者に相談する |
| `MMI_SHEET_NOT_FOUND` | シートが無い | `inspect`が示したシート名を使う |
| `MMI_INVALID_XML` | XML Spreadsheet 2003でない | 対応形式の正本を使う |
| `MMI_INVALID_PARAM_VALUE` | パラメータの値が不正 | 上の表の値に直す |
| `MMI_UNKNOWN_PARAM` | 知らないパラメータ | 綴りを直す |

## 納品

- PDF: `mmi render 文書.md --to html -o 文書.html`の後、HTMLをPDFへ変換する（確認済みの経路はWeasyPrint）。
- 別紙の一覧: `mmi manifest 文書.md -o 文書.delivery-manifest.csv`

仕様の正本は[MMI Notation v1](https://github.com/hat47x/markdown-matrix-injector/blob/main/04_Documentation/spec/mmi-notation-v1.md)。
