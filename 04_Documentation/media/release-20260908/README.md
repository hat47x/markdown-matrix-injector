# 画像と動画で使い方を見る

## 実際の操作を見る（60秒）

[納品一覧の生成とシート名補完の操作動画](mmi-live-walkthrough.mp4)

Windows版VS Codeでの連続した画面録画です。120秒の操作を2倍速にし、日本語字幕を付けました。音声はありません。

| 時間 | 内容 |
| --- | --- |
| 0–25秒 | Markdownを開き、コマンドパレットから納品一覧を出力 |
| 25–40秒 | 別紙2件のCSVを確認し、補完の練習ファイルを開く |
| 40–60秒 | Ctrl+SpaceでExcelのシート候補を表示し、状態遷移と範囲を入力 |

動画内の `_completion-check.md` は撮影用に作った練習ファイルです。手元で試す場合は、サンプルフォルダーに新しいMarkdownファイルを作り、`![[./data/design.xlsx#` まで入力してください。候補を選び、`|A1:F5?header=first]]` を続けると4行の表になります。

## 表・別紙・PDFを見る（36秒）

[表示例の解説動画](mmi-visual-guide.mp4)

こちらは実VS Codeの静止画2点と、出力PDFの1ページをつないだ解説です。連続操作録画とは別の動画です。

| 時間 | 内容 |
| --- | --- |
| 0–12秒 | CSVから必要な4件を表に表示 |
| 12–24秒 | 大きな表を別紙カードで案内 |
| 24–36秒 | 状態遷移表を横向きのページで印刷 |

## 画面一覧

| 画像 | 確認できること |
| --- | --- |
| [最初の表](01-first-table.png) | CSVの4件を表示 |
| [リリース判定表](02-release-review.png) | 要確認の3件を抽出・強調 |
| [別紙カード](03-attachment-cards.png) | 添付する原本を案内 |
| [問題パネル](04-diagnostics.png) | ファイル・シート・XML形式の誤り3件 |
| [納品一覧](05-delivery-manifest.png) | 別紙2件のCSV出力 |
| [PDFの2ページ目](06-print-landscape.png) | 横向きの状態遷移表 |
| [Excelの起動結果](07-excel-opened.png) | URIの許可をユーザーが行った後、design.xlsxがExcelで開いた |
| [シート補完](08-sheet-completion.png) | API・権限・状態遷移の候補 |

すべて架空の業務データです。VS Code画面にはリポジトリとファイルの名前が含まれます。PDFはMMIで展開したHTMLをWeasyPrint 69.0で変換したものです。

[検証記録](../../release-validation-2026-09-08.md) · [チュートリアル](../../tutorial.md) · [サンプル](../../samples/practical/README.md)
