# リリース判定会議

判定項目は10件です。「要確認」の3件を会議の冒頭で確認します。
以下は業務システムの架空の判定台帳であり、MMI自体の公開可否ではありません。

![[./data/release.csv#Sheet1|A1:F11?header=first&grep=要確認&highlightColumn=判定&highlightValue=要確認&caption=表1　要確認の3項目&id=release-open]]

## 全判定項目

![[./data/release.csv#Sheet1|A1:F11?header=first&caption=表2　全判定項目]]

## 同梱する別紙

![[./data/design.xlsx?mode=card&caption=別紙1　状態遷移・権限・API]]

![[./data/applications-wide.csv#Sheet1|A1:K61?caption=別紙2　申請一覧]]

Markdownのソースを開き、コマンドパレットから `MMI: Generate Delivery Manifest` を実行します。
隣に作成される `08-release.delivery-manifest.csv` で上の2ファイルを確認してください。
CSVはチェックリストです。元データを自動コピーしたりZIPにまとめたりはしません。
