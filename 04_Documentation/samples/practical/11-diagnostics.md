# エラーから復帰する練習

このファイルだけは、意図的に3つの誤った参照を含みます。
「問題」パネルで理由を確認してから、下の正しい記法へ直します。

## 1. 存在しないファイル

![[./data/not-found.csv#Sheet1|A1:B3]]

正しい参照: `![[./data/requirements.csv#Sheet1|A1:G5?header=first]]`

## 2. 存在しないシート

![[./data/design.xlsx#存在しないシート|A1:F3]]

正しい参照: `![[./data/design.xlsx#状態遷移|A1:F3?header=first]]`

## 3. 一般的なXML

![[./data/not-spreadsheet.xml]]

正しい参照: `![[./data/migration.xml#移行確認|A1:F9?header=first]]`

ファイル名・シート名・XML形式を1つずつ確認します。誤りを直すと該当する診断が消えます。
