# Markdown Matrix Injector（MMI）

![Markdown Matrix Injector（MMI）のブランディングイメージ](04_Documentation/assets/mmi-branding-image.png)

> 本リポジトリは、生成AIを用いた初期開発中のソースコードを公開するものです。現時点で人的レビューを伴っておらず、仕様や実装は変更される場合があります。

**ExcelやCSVで管理している表を、元ファイルを残したままMarkdown文書に表示するためのソフトウェアです。**

現在の主な利用方法は、VS Code拡張で表を読み取り専用で参照することです。要件一覧、権限表、試験結果などを元のExcel・CSV・XMLファイルで管理し、設計書には必要な行や列だけを表示できます。

今後は、表に加えて画像や階層構造も扱い、出典を確かめながらMarkdownと通常の添付ファイルへ段階的に移すことを目指します。VS Code拡張のほか、共通処理機構（Core）、コマンドライン操作（CLI）、機械可読な契約をAIや自動検証から使える構成を検討しています。現在使える機能と今後の構想は区別して説明します。

製品シリーズ全体の構想と役割の分担は、[YI Constellation 構想と設計](https://github.com/hat47x/tai-pleroma/blob/main/docs/YI_Constellation.pptx)をご覧ください。MMIは、文書と出典を扱うSHO Composerの構想に向けた検証用製品として紹介されています。SHOの独立した製品定義は未確認です。資料の確認状況は2026年10月時点のものです。

## 初めて読む方へ

Markdownは、見出しや箇条書きなどを簡単な記号で記述できる文書形式です。VS Codeは、その文書を編集・プレビューできるソフトウェアです。

MMIでは、ExcelやCSVの表を文書に貼り付ける代わりに、**参照するファイルとセルの範囲を指定**します。例えばExcelの要件一覧を修正したら、参照先の表を読み直して表示できます。表の変更に合わせて、周囲の説明文が自動で書き換わることはありません。文章と表の対応は利用者が確認してください。

初めて試す方は[チュートリアル](04_Documentation/tutorial.md)へ、開発中の機能を含む計画は[現在の作業](01_Plans/README.md)へ進んでください。

![VS CodeでCSVの要件を表示](04_Documentation/media/release-20260908/01-first-table.png)

[チュートリアル](04_Documentation/tutorial.md) · [利用マニュアル](04_Documentation/user-manual.md) · [実務サンプル12本](04_Documentation/samples/practical/README.md) · [操作動画](04_Documentation/media/release-20260908/mmi-live-walkthrough.mp4)

## どんな仕事で使えるか

| 場面 | 使い方の例 |
| --- | --- |
| 要件レビュー | 24件の要件から担当領域や「要確認」の行を選んで表示する |
| 業務設計 | Excelで管理する状態遷移表や役割別の権限表を設計書で参照する |
| API設計 | JSONの応答例をコードとして見やすく表示する |
| 試験・運用引継ぎ | 未実施の試験や担当ごとの障害対応手順を参照する |
| 納品準備 | 大きな表を別紙として扱い、同梱するファイルの一覧を作る |

## インストール

現在の検証版は、[GitHub Releasesのpre-release v0.2.0](https://github.com/hat47x/markdown-matrix-injector/releases/tag/v0.2.0)にあるVSIXファイルからインストールします。同じリリースにはコマンドライン版もあります。アクセスできるリリース資産を確認してください。

VS Codeで`Ctrl+Shift+P`を押し、`Extensions: Install from VSIX...`を選択してMMIの`.vsix`を指定します。更新後はVS Codeのウィンドウを再読み込みしてください。拡張を使用するだけなら、Node.jsを別途インストールする必要はありません。

最低対応バージョンはVS Code 1.100.0です。WindowsのVS Code 1.136.1で実機検証した記録があります。**VS Code Marketplaceでは、まだ公開していません。**

## まず4件の要件を表示する

1. [実務サンプル](04_Documentation/samples/practical/README.md) をフォルダーごと用意します。`data`も一緒に置きます。
2. VS Codeで `01-first-table.md` を開きます。
3. `Ctrl+Shift+V` でプレビューを開きます。

プレビューにはREQ-001〜REQ-004の4件が表として表示されます。Markdownには、次の参照記法を1行記述しています。

```md
![[./data/requirements.csv#Sheet1|A1:G5?header=first&columns=A,C,D,G&caption=表1　認証・権限の要件]]
```

`./data/requirements.csv`の`A1:G5`を読み、先頭行を見出しにし、指定したA・C・D・G列を表示します。元のCSVは書き換えません。詳しい操作と画面の見方は[チュートリアル](04_Documentation/tutorial.md)を参照してください。

## 実務の流れで試す

[申請・承認システムのサンプル集](04_Documentation/samples/practical/README.md)には、12本の文書、9つのCSV（計172件）、3シートのExcel、XML、TSVがあります。**すべて架空のデータ**です。要件から設計、試験、運用、リリース判定までの文書を順に確認できます。

![別紙のカード表示](04_Documentation/media/release-20260908/03-attachment-cards.png)

大きな表は別紙カードとして表示できます。カード内のファイル名を選ぶとVS Codeで開き、「外部アプリで開く」を選ぶとOSの既定のアプリで開きます。別紙となったファイルは、`MMI: Generate Delivery Manifest`で納品一覧へ出力できます。

## できることと対応範囲

- Excel・CSV・TSV・XML Spreadsheet 2003からセル値を読み取り、Markdownのプレビューへ表示します。
- 行や列の絞り込み、縦横反転、強調表示、JSONなどのコード表示ができます。
- 表題、相互参照、別紙カードを表示し、納品一覧をCSVへ出力できます。
- ファイル・シート・範囲の補完や、参照先・指定の誤りの表示に対応します。誤りはVS Codeの「問題」パネルで確認し、提示された候補から修正できます。
- 参照を案内付きで作成・編集できます。「状態遷移表のIDと操作を見せて」などの説明から表を探す機能と、ホバーでの表示確認にも対応しています。挿入は利用者の確認後に行い、自動的には確定しません。
- MMIが展開したHTMLは、別の生成器を使ってPDFにできます。

**MMIの表参照機能は元ファイルを変更しません。** ただし、外部アプリで開いたファイルは、そのアプリの通常の操作で編集・保存できます。

数式の再計算、画像・図形・マクロ、Excelの配色・結合セルの再現には対応していません。`grep`は文字列の部分一致を探す機能であり、集計や業務規則の実行は行いません。

## PDFについて

[設計書PDFの例](04_Documentation/samples/practical/10-print.pdf)は、縦・横・縦の3ページで構成されています。検証済みの経路は**MMIで参照を展開したHTMLを、WeasyPrint 69.0でPDF化する方法**です。

一般的なMarkdown変換器だけでは、MMIの参照記法を表として表示できません。VS CodeのMarkdown PDF拡張から直接PDFへ出力する方法も、今回の検証対象ではありません。手順は[利用マニュアル](04_Documentation/user-manual.md#pdfを作る)にあります。

## 制約と検証状況

CSVはUTF-8で読み込みます。XMLはXML Spreadsheet 2003に対応しています。一般のXML文書、外部URL、ワークスペース外のファイルは参照できません。

外部アプリで開けるのは、信頼済みのローカルワークスペース内の表データです。貼り付けやドラッグ＆ドロップでは、元のアプリから渡された情報だけを使うため、セルのコピーから元ファイルを必ず特定できるわけではありません。

環境、実機確認、テスト結果、未確認事項は [リリース準備の検証記録](04_Documentation/release-validation-2026-09-08.md) にまとめています。
ドキュメントの整備やローカルでの検証は、Marketplace公開や正式リリースの承認とは別の作業です。

## 詳しい資料

| 資料 | 内容 |
|---|---|
| [チュートリアル](04_Documentation/tutorial.md) | インストールから最初の表まで |
| [利用マニュアル](04_Documentation/user-manual.md) | 日々の操作、別紙、納品一覧、PDF、困ったとき |
| [リファレンス](04_Documentation/reference.md) | 記法とパラメータの詳細 |
| [動画と画像](04_Documentation/media/release-20260908/README.md) | 実画面で操作を確認 |
| [内部の仕組み](04_Documentation/how-it-works.md) | 読み込み・キャッシュ・描画の流れ |
| [MMI Notation v1](04_Documentation/spec/mmi-notation-v1.md) | 読み取り専用の参照規約 |
| [MCPサーバ](04_Documentation/mcp-server.md) | AIエージェントから読み取り・検証を呼ぶ（stdio、読み取り専用） |
| [パラメータの構造定義](04_Documentation/spec/params.schema.json) | ツール向けの機械可読定義 |

MMIはVS Code拡張に加えて、`![[...]]`の公開規約と適合試験を管理しています。
ほかのエディターやツールでも同じ表参照を扱えるようにするための仕様です。

## 開発に参加する

Node.js 22以上とnpmを使います。

```bash
cd 03_Implement
npm ci
npm run build
npm test
npm run test:e2e
```

配る成果物（VSIXとCLI）は`npm run release:candidate`で作ります。検査結果と成果物のSHA-256が`artifacts/release/<version>/`に残ります。

[CONTRIBUTING.md](CONTRIBUTING.md) と [AGENTS.md](AGENTS.md) を参照してください。
要件は [00_Prompt/requirements.md](00_Prompt/requirements.md)、方針と実行計画は [01_Plans](01_Plans/README.md) にあります。

## ライセンス

[MIT](LICENSE)
