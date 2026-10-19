# はじめてのMMI：ExcelやCSVの表をMarkdownで読む

ExcelやCSVの表を設計書に貼り付けると、元の表を更新するたびに貼り直す必要があります。

MMIなら、**元のファイルをそのまま残し、文書には必要な部分だけを表示できます。** このチュートリアルでは、架空の申請・承認システムのサンプルを使い、表の表示、絞り込み、Excelの参照までを試します。

操作はWindows版のVS Codeを前提とし、所要時間の目安は15〜30分です。

## 用意するもの

- デスクトップ版のVS Code（MMI拡張の最低対応バージョンは1.100.0）
- MMI拡張のVSIXファイル（検証版0.2.0以降。この手順の画面は0.1.0で撮影）
- [実務サンプル](samples/practical/README.md)のフォルダー一式（Markdown文書と`data`フォルダーの両方）

拡張機能を使うだけなら、Node.jsのインストールや開発用のビルドは必要ありません。サンプルの業務データはすべて架空のものです。

## 1. MMIをインストールする

1. VS Codeで`Ctrl+Shift+P`を押します。
2. `Extensions: Install from VSIX...`（VSIXからのインストール）を検索します。
3. 手元のMMIの`.vsix`ファイルを選びます。
4. 再読み込みを求められたら、VS Codeのウィンドウを再読み込みします。

左側の拡張機能一覧に`Markdown Matrix Injector (MMI)`が表示されれば、インストールできています。

MMIは公開準備中です。この手順では、拡張機能の公開サイト（Marketplace）ではなく、手元のVSIXファイルから導入します。

## 2. サンプルをフォルダーごと開く

VS Codeの「ファイル」→「フォルダーを開く」から、`practical`フォルダーを開きます。リポジトリを取得済みの場合は、`04_Documentation/samples/practical`にあります。

```text
practical/
  01-first-table.md
  02-requirements.md
  ...
  data/
    requirements.csv
    design.xlsx
    ...
```

**Markdown文書だけを取り出さず、`data`フォルダーも一緒に置いてください。** たとえば`./data/requirements.csv`は、「このMarkdown文書と同じフォルダーにある`data`内の`requirements.csv`」という意味です。

## 3. 最初の表を表示する

`01-first-table.md`を開き、`Ctrl+Shift+V`を押してプレビューを表示します。

「認証・権限の要件」という表題の下に、`REQ-001`〜`REQ-004`の4件が表示されることを確かめてください。

![VS Codeで表示した最初の4要件](media/release-20260908/01-first-table.png)

この表を表示しているのは、Markdown文書に書かれた次の1行です。

```md
![[./data/requirements.csv#Sheet1|A1:G5?header=first&columns=A,C,D,G&caption=表1　認証・権限の要件]]
```

長く見えますが、それぞれの部分には役割があります。

| 書かれている部分 | 意味 |
| --- | --- |
| `./data/requirements.csv` | 元のCSVファイル |
| `#Sheet1` | シート名。CSVでは`Sheet1`を使います |
| `A1:G5` | A〜G列の1〜5行目 |
| `header=first` | 最初の行を見出しにする |
| `columns=A,C,D,G` | A・C・D・G列だけを表示する |
| `caption=...` | 表題を付ける |

指定した5行のうち、1行が見出し、残り4行がデータです。

この`![[...]]`という書き方を「MMI参照記法」と呼びます。本文では独立した1行として書き、前後に空行を入れると見やすくなります。バッククォートで囲んだコード例は表に変換されません。

## 4. 表題を変えてみる

1. プレビュー右上の「ソース ファイルとして再度開く」を選び、Markdownの編集画面に戻ります。
2. `caption=表1　認証・権限の要件`を`caption=次回のレビュー対象`に書き換え、保存します。
3. もう一度プレビューを開き、表題が変わったことを確かめます。

**変わるのは文書に表示する表題だけです。** 元のCSVの値は変更されません。

## 5. 必要な行だけを表示する

次は、24件の要件から状態が「要確認」の5件だけを表示します。`02-requirements.md`を開いてください。

```md
![[./data/requirements.csv#Sheet1|A1:G25?header=first&columns=A,C,F,G&grep=要確認&highlightColumn=状況&highlightValue=要確認&caption=次回レビューの対象]]
```

プレビューには`REQ-003`、`REQ-008`、`REQ-010`、`REQ-016`、`REQ-024`の5件が表示されます。

ここで使った`grep=要確認`は、行に「要確認」という文字が含まれるかを調べる指定です。検索は`columns`で表示列を選んだ後に行われるため、検索したい列も`columns`に含めてください。`highlightColumn`と`highlightValue`は、該当する値を目立たせる指定です。

次の画像は、別のサンプル`08-release.md`で「要確認」の3件を強調した例です。

![要確認の3件を強調した実画面](media/release-20260908/02-release-review.png)

## 6. Excelのシートを参照する

CSVだけでなく、Excelのシートも参照できます。`03-workflow.md`を開き、次の記法を確認してください。

```md
![[./data/design.xlsx#状態遷移|A1:F13?header=first&caption=状態遷移]]
```

プレビューには12通りの状態遷移が表示されます。Excelの配色や結合セルをそのまま再現するのではなく、セルの値をMMIの表として見せます。参照してもExcelファイル自体は変更されません。

シート名が分からないときは、記法の`#`の後で`Ctrl+Space`を押すと候補から選べます。

![Excelのシート補完](media/release-20260908/08-sheet-completion.png)

## 7. 大きな表を扱う

`09-large-table.md`には60件・11列の申請一覧があります。このように大きな範囲は、表を全文表示せず、元のファイルを開くための**別紙カード**として表示されます。

![元データを参照する別紙カード](media/release-20260908/03-attachment-cards.png)

カードのファイル名を選ぶとVS Code内で、「外部アプリで開く」を選ぶとファイル形式に関連付けられたアプリで開きます。別紙を納品する場合は、元のExcelやCSVも一緒に渡してください。カードだけで元ファイルが複製されるわけではありません。

大きな範囲でも、必要な行と列を**表として表示したい**場合は`mode=table`を指定します。

```md
![[./data/applications-wide.csv#Sheet1|A1:K61?mode=table&header=first&columns=A,B,C,E&grep=承認待ち]]
```

この例では、承認待ちの15件が表示されます。表かカードかの判定は、列の絞り込みより先に行われます。そのため、`columns`だけを指定しても表表示には切り替わりません。

## 動画で操作を確認する

[表・別紙カード・PDFの解説動画](media/release-20260908/mmi-visual-guide.mp4)は、実画面とPDFの静止画をつないだ36秒の動画です。[納品一覧とシート補完の実操作動画](media/release-20260908/mmi-live-walkthrough.mp4)では、実際の操作を2倍速の60秒で確認できます。

それぞれの内容と確認ポイントは[動画ガイド](media/release-20260908/README.md)にまとめています。

## 表が表示されないとき

次の順に確認してください。

1. VS Codeの拡張機能一覧にMMIがあるか。インストール・更新直後なら、ウィンドウを再読み込みします。
2. Markdown文書を保存したか。参照先のファイルが作業フォルダー内にあるか。
3. ファイル名、シート名、セル範囲が正しいか。CSVのシート名は`Sheet1`です。
4. パラメータを追加した場合は、いったん減らして一つずつ戻すと、原因を見つけやすくなります。

`11-diagnostics.md`には、わざと誤った参照を3件用意しています。`Ctrl+Shift+M`でVS Codeの「問題」パネルを開き、エラーの説明を正しい記法と見比べてください。

## ここまでの確認

- [ ] CSVの4件を表として表示できた。
- [ ] 表題を変更するか、必要な行だけを表示できた。
- [ ] Excelのシートを参照できた。
- [ ] MMIからの参照では元ファイルを書き換えないと確認できた。

続いて自分の仕事に近い例を試すには、[実務サンプルの一覧](samples/practical/README.md)から文書を選んでください。納品一覧やPDFの作成手順は[利用マニュアル](user-manual.md)、細かな指定は[リファレンス](reference.md)にあります。

記法の正式な定義は[MMI Notation v1](spec/mmi-notation-v1.md)、環境と実測結果は[検証記録](release-validation-2026-09-08.md)を参照してください。
