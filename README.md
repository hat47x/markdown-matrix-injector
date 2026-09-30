# Markdown Matrix Injector（MMI）

**レガシーな業務文書・構造化データを、Markdown中心の資産へ安全に橋渡しするための基盤です。**

現在の参照実装は、Excel・CSV・XMLの表をMarkdownから読み取り専用で参照するVS Code拡張です。要件一覧、権限表、試験結果を元ファイルで管理しながら、設計書には必要な行と列だけを表示できます。

今後は、元文書を残したまま表・画像・階層構造などを段階的に取り込み、出典を追跡しつつ標準Markdown・通常の添付へ実体化できる構成へ広げます。VS Code拡張だけを本体とはせず、共通Core、CLI、機械可読な契約をAI・CIからも利用できることを目指します。未実装の機能は、以下の「できることと対応範囲」には含めません。

![VS CodeでCSVの要件を表示](04_Documentation/media/release-20260908/01-first-table.png)

[チュートリアル](04_Documentation/tutorial.md) · [利用マニュアル](04_Documentation/user-manual.md) · [実務サンプル12本](04_Documentation/samples/practical/README.md) · [操作動画](04_Documentation/media/release-20260908/mmi-live-walkthrough.mp4)

## どんなときに使える？

| 仕事 | MMIでできること |
|---|---|
| 要件レビュー | 24件の要件から、担当領域や「要確認」の行を表示 |
| 業務設計 | Excelの状態遷移や役割別の権限を設計書へ参照 |
| API設計 | 応答例のJSONを読みやすいコード表示にする |
| 試験確認・運用引継ぎ | 未実施の試験や担当別の障害対応手順を抜き出す |
| 納品準備 | 大きな表を別紙にし、同梱するファイルの一覧を作る |

## インストール

公開準備中の検証版は、受け取った `.vsix` ファイルからインストールしてください。
VS Codeで `Ctrl+Shift+P` → `Extensions: Install from VSIX...` を選び、MMIのVSIXを指定します。
更新後はウィンドウを再読み込みします。拡張を使うだけならNode.jsの導入は不要です。

最低対応バージョンはVS Code 1.96.0です。今回の実機検証はWindowsのVS Code 1.136.1で行っています。
MarketplaceやGitHub Releasesに配布物が公開済みであることは、この手順の前提にしていません。

## まず4件の要件を表示する

1. [実務サンプル](04_Documentation/samples/practical/README.md) をフォルダーごと用意します。`data`も一緒に置きます。
2. VS Codeで `01-first-table.md` を開きます。
3. `Ctrl+Shift+V` でプレビューを開きます。

REQ-001〜REQ-004の4件が表として表示されます。サンプルに書かれているのは次の1行です。

```md
![[./data/requirements.csv#Sheet1|A1:G5?header=first&columns=A,C,D,G&caption=表1　認証・権限の要件]]
```

`./data/requirements.csv`の`A1:G5`を読み、先頭行を見出しにして、4列だけを表示しています。
手順と画面の見方は [やさしいチュートリアル](04_Documentation/tutorial.md) で説明しています。

## 実務の流れで試す

[申請・承認システムのサンプル集](04_Documentation/samples/practical/README.md) には、12本の文書と、9つのCSV（計172件）、3シートのExcel、XML、TSVを収録しました。
すべて架空のデータです。要件→設計→試験→運用→リリース判定をたどれます。

![別紙のカード表示](04_Documentation/media/release-20260908/03-attachment-cards.png)

大きな表はカードとして参照できます。ファイル名はVS Code内で開くリンク、「外部アプリで開く」はOSの既定アプリを開く操作です。
カードになったファイルをチェックリストへ出力する `MMI: Generate Delivery Manifest` も用意しています。

## できることと対応範囲

- Excel・CSV・TSV・XML Spreadsheet 2003のセル値を読み取って表示。
- 行・列の絞り込み、縦横反転、強調表示、JSONなどのコード表示。
- 表題・相互参照・別紙カードと、納品一覧のCSV出力。
- ファイル・シート・範囲・指定の補完、参照先や指定の誤りを「問題」パネルへ表示し、実在する候補への修正を提示。
- 案内付きの参照の作成・編集、説明（「状態遷移表のIDと操作を見せて」）からの表の検索、ホバーでの表示確認。いずれも確認してから挿入し、自動では確定しない。
- MMIで展開済みのHTMLから、別の生成器を使ってPDF化。

**元データはMMIから変更しません。** ただし、外部アプリで開いた後の編集・保存は通常の操作です。
数式の再計算、画像・図形・マクロ、Excelの配色や結合セルの再現は対象外です。
`grep`は部分一致検索であり、集計や業務ルールの実行機能ではありません。

## PDFについて

[設計書PDFの例](04_Documentation/samples/practical/10-print.pdf) は縦・横・縦の3ページです。
今回確認した経路は **MMIで展開したHTML → WeasyPrint 69.0** です。
一般のMarkdown変換だけでは参照記法が表になりません。VS CodeのMarkdown PDF拡張からの直接出力は、今回の検証済み経路ではありません。
手順は [利用マニュアル](04_Documentation/user-manual.md#pdfを作る) にあります。

## 制約と検証状況

CSVはUTF-8を使います。一般的なXML、外部URL、ワークスペース外のファイルは参照できません。
外部アプリの起動は、信頼済みのローカルワークスペース内の表データが対象です。
貼り付け・ドラッグ＆ドロップは元アプリが渡す情報に依存し、セルのコピーから常に元ファイルを特定できるわけではありません。

環境、実機確認、テスト結果、未確認事項は [リリース準備の検証記録](04_Documentation/release-validation-2026-09-08.md) にまとめています。
この文書整備・ローカル検証と、Marketplace公開・正式リリースの判定は別の作業です。

## 詳しい資料

| 資料 | 内容 |
|---|---|
| [チュートリアル](04_Documentation/tutorial.md) | インストールから最初の表まで |
| [利用マニュアル](04_Documentation/user-manual.md) | 日々の操作、別紙、納品一覧、PDF、困ったとき |
| [リファレンス](04_Documentation/reference.md) | 記法とパラメータの詳細 |
| [動画と画像](04_Documentation/media/release-20260908/README.md) | 実画面で操作を確認 |
| [内部の仕組み](04_Documentation/how-it-works.md) | 読み込み・キャッシュ・描画の流れ |
| [MMI Notation v1](04_Documentation/spec/mmi-notation-v1.md) | 読み取り専用の参照規約 |
| [パラメータSchema](04_Documentation/spec/params.schema.json) | ツール向けの機械可読定義 |

MMIはVS Code拡張に加えて、`![[...]]`の公開規約と適合試験を管理しています。
特定のエディターだけに閉じず、同じ表参照を扱える実装を増やすための仕様です。

## 開発に参加する

Node.js 22以上とnpmを使います。

```bash
cd 03_Implement
npm ci
npm run build
npm test
npm run test:e2e
```

[CONTRIBUTING.md](CONTRIBUTING.md) と [AGENTS.md](AGENTS.md) を参照してください。
要件は [00_Prompt/requirements.md](00_Prompt/requirements.md)、方針と実行計画は [01_Plans](01_Plans/README.md) にあります。

## ライセンス

[MIT](LICENSE)
