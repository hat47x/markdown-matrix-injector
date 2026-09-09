# 障害対応の手引き

12件の切り分け手順から、まず認証関連の2件を確認します。

![[./data/triage.csv#Sheet1|A1:F13?header=first&grep=AUTH&caption=表1　認証の切り分け]]

## 運用担当が受け持つ手順

![[./data/triage.csv#Sheet1|A1:F13?header=first&grep=運用担当&caption=表2　運用担当の5件]]

通知、添付、バッチ、性能の手順を取り出します。実運用では自社の監視項目・担当窓口に置き換えてください。

## 移行前の確認（SpreadsheetML）

![[./data/migration.xml#移行確認|A1:F9?header=first&caption=表3　移行対象の8分類]]

このXMLはXML Spreadsheet 2003形式です。設定ファイルなどの一般的なXMLは読み込めません。
