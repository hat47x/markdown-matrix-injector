# MMI Full Spec Sample Markdown

## Publication
- Public Gist: [https://gist.github.com/<YOUR_GITHUB_ACCOUNT>/mmi-full-spec-sample-markdown](https://gist.github.com/<YOUR_GITHUB_ACCOUNT>/mmi-full-spec-sample-markdown)
- Canonical source: `04_Documentation/samples/mmi-full-spec-sample.md`

Public GistのURLは公開先を記入するための**ひな形**です。`<YOUR_GITHUB_ACCOUNT>`を含む状態では、公開済みの実例を示すリンクとして扱わないでください。

このサンプルは`mmi-full-spec-sample.xlsx`を使い、Phase 1〜5で扱う主な記法・表示指定・入力支援の確認点を、1つのMarkdown文書にまとめたものです。既存のExcelファイルをMarkdownへ書き写すのではなく、必要な範囲を参照します。

## Target reader
- MMI の主要仕様（Phase 1〜5）を 1 ファイルで通し確認したい評価者。
- 仕様デモを再現し、Scenario から参照可能な実例を探しているドキュメント担当。

## Prerequisites
- Python 3 実行環境。
- `openpyxl` をインストールして `mmi-full-spec-sample.xlsx` を生成できること。
- MMI 記法（`![[...]]`）をレンダリングできる環境。

## Expected result
- Phase 1〜5 の主要パラメータ挙動を、単一 Markdown サンプルで順に確認できる。
- Scenario/Reference から参照する際に、章番号単位で説明しやすい具体例を得られる。

## Known limitations
- 本ファイルは手動確認用サンプルであり、自動テストの合否を保証しない。各節は**これから確認する項目**を示しており、画面操作や印刷の受入が完了した記録ではありません。
- 実行結果は利用中のレンダラ実装状況に依存する。


## 事前準備 (Excel 生成)
`mmi-full-spec-sample.xlsx`はGitで管理しません。リポジトリのルートから次のコマンドを実行し、検証用のExcelファイルを生成してください。生成用スクリプトを実行せずにMarkdownだけを開くと、参照先が見つからない場合があります。

```bash
python3 -m pip install --user openpyxl
python3 04_Documentation/samples/generate_mmi_full_spec_sample_xlsx.py
```

生成先: `04_Documentation/samples/mmi-full-spec-sample.xlsx`

以下の各節では、まずコードブロックに記法の文字列を載せ、その後に同じ記法を実際の埋め込みとして記述しています。**コードブロック内の記法は表示例**であり、表として展開されるのはコードブロック外の記法です。

## 1) 基本記法 (Phase 1)
`Matrix`シートの`A1:H6`を指定します。ファイル名、シート名、セル範囲という基本構造を確認する例です。
```md
![[./mmi-full-spec-sample.xlsx#Matrix|A1:H6]]
```

![[./mmi-full-spec-sample.xlsx#Matrix|A1:H6]]

## 2) header=first + columns + grep (Phase 2)
先頭行を見出しに使い、A・B・D・F列を選んでから、`AUTH`を含む行を表示する例です。元のシートから列や行を削除する操作ではありません。
```md
![[./mmi-full-spec-sample.xlsx#Matrix|A1:H13?header=first&columns=A,B,D,F&grep=AUTH]]
```

![[./mmi-full-spec-sample.xlsx#Matrix|A1:H13?header=first&columns=A,B,D,F&grep=AUTH]]

## 3) transpose=true (Phase 2)
`Transpose`シートの表を縦横反転します。元データの行と列は書き換えず、Markdown上での見せ方だけを変える指定です。
```md
![[./mmi-full-spec-sample.xlsx#Transpose|A1:E4?header=first&transpose=true]]
```

![[./mmi-full-spec-sample.xlsx#Transpose|A1:E4?header=first&transpose=true]]

## 4) header=2 (数値指定) (Phase 2)
`HeaderRow`シートの先頭行には説明用の値があり、2行目に`Name`・`Value`・`Comment`の見出しがあります。`header=2`で見出し行を明示する例です。
```md
![[./mmi-full-spec-sample.xlsx#HeaderRow|A1:C5?header=2]]
```

![[./mmi-full-spec-sample.xlsx#HeaderRow|A1:C5?header=2]]

## 5) highlight + formatColumn(複数) (Phase 2)
`highlightColumn`と`highlightValue`で特定の列・値の強調を指定し、`formatColumn`を2回記述します。生成元データではE列がJSON形式の文字列、H列が通常のタグ文字列です。複数指定の扱いと実際の表示を確認する例であり、H列の値そのものがJSONに変わるわけではありません。
```md
![[./mmi-full-spec-sample.xlsx#Matrix|A1:H13?header=first&highlightColumn=role&highlightValue= admin &formatColumn=E:json&formatColumn=H:json]]
```

![[./mmi-full-spec-sample.xlsx#Matrix|A1:H13?header=first&highlightColumn=role&highlightValue= admin &formatColumn=E:json&formatColumn=H:json]]

## 6) caption + id + pageBreak + orientation (Phase 3)
表題と参照用IDを付け、印刷時の改ページ位置と用紙の向きを指定します。`pageBreak=before`と`orientation=landscape`は印刷用の指定です。Markdownプレビューでの表示と、PDF生成後の改ページ・向きは分けて確認してください。
```md
![[./mmi-full-spec-sample.xlsx#Matrix|A1:H8?header=first&caption=認可マトリクス&id=tbl-auth-matrix&pageBreak=before&orientation=landscape]]
```

![[./mmi-full-spec-sample.xlsx#Matrix|A1:H8?header=first&caption=認可マトリクス&id=tbl-auth-matrix&pageBreak=before&orientation=landscape]]

## 7) mode=card (Phase 4)
`mode=card`を明示して、表ではなく元データへの参照カードを表示する例です。Excelの内容をMarkdown本文へ複製する指定ではありません。
```md
![[./mmi-full-spec-sample.xlsx#Matrix|A1:H8?mode=card&caption=カード縮退サンプル]]
```

![[./mmi-full-spec-sample.xlsx#Matrix|A1:H8?mode=card&caption=カード縮退サンプル]]

## 8) Smart fallback: 列数 10 超 (Phase 4)
`WideMatrix`シートの12列を参照します。列数が既定の10列を超えた場合の自動的なカード表示を確認する例です。
```md
![[./mmi-full-spec-sample.xlsx#WideMatrix|A1:L15]]
```

![[./mmi-full-spec-sample.xlsx#WideMatrix|A1:L15]]

## 9) Smart fallback: セル数 500 超 (Phase 4)
`LargeMatrix`シートの`A1:Y26`は25列×26行、合計650セルです。500セル超の条件に該当しますが、**列数も10列を超えています**。したがって、この例だけで「セル数条件だけが原因でカード化した」とは判定できません。
```md
![[./mmi-full-spec-sample.xlsx#LargeMatrix|A1:Y26]]
```

![[./mmi-full-spec-sample.xlsx#LargeMatrix|A1:Y26]]

## 10) mode=table で Smart fallback をオーバーライド (Phase 4)
8節と同じ広い範囲に`mode=table`を付け、カードではなく表として表示する指定を試します。列数が多いため、表示の読みやすさも別途確認してください。
```md
![[./mmi-full-spec-sample.xlsx#WideMatrix|A1:L15?mode=table&header=first]]
```

![[./mmi-full-spec-sample.xlsx#WideMatrix|A1:L15?mode=table&header=first]]

## 11) シート未指定 (ファイル全体参照) (Phase 4)
シート名や範囲を指定せず、Excelファイル全体を参照します。この指定は、各シートを本文にすべて展開するのではなく、別紙カードとして扱う例です。
```md
![[./mmi-full-spec-sample.xlsx]]
```

![[./mmi-full-spec-sample.xlsx]]

## 12) Autocomplete / Diagnostics / Paste&D&D の手動確認ポイント (Phase 5)
ここからは表の表示例ではなく、VS Codeの編集画面で試す操作です。入力補完、問題の検出、貼り付け・ドラッグ＆ドロップによる入力支援を、利用する環境・操作経路に合わせて確かめます。次の項目は確認手順の目安であり、実行・合格済みという記録ではありません。
- Autocomplete: `![[` 入力後に filepath → `#` → sheet/range → `?` → parameter の順で候補が出ること。
- Diagnostics: ファイル名 typo や存在しない sheet 指定で Problems が出ること。
- Paste&D&D: Excel/スプレッドシート由来の貼り付けやドロップで embed 記法が挿入されること。
