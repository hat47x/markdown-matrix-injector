# リリース判定会議

申請・承認システムを公開する前の確認を想定した例です。判定台帳には10件の項目があり、会議の冒頭では、そのうち「要確認」の3件を表示します。

ここにある判定は**架空の業務システムに関するもの**です。MMI自体を公開してよいかどうかの判定ではありません。

![[./data/release.csv#Sheet1|A1:F11?header=first&grep=要確認&highlightColumn=判定&highlightValue=要確認&caption=表1　要確認の3項目&id=release-open]]

`grep=要確認`は、該当する文字を含む行だけを表示する指定です。`highlightColumn=判定`と`highlightValue=要確認`は、「判定」列の「要確認」を強調表示するために使います。

## 全判定項目

絞り込みのない表では、10件の判定項目をまとめて確認できます。

![[./data/release.csv#Sheet1|A1:F11?header=first&caption=表2　全判定項目]]

## 同梱する別紙

会議資料とともに渡す元ファイルは、次の2件です。文書には表の内容をコピーする代わりに、元ファイルを開ける**別紙カード**を表示します。

![[./data/design.xlsx?mode=card&caption=別紙1　状態遷移・権限・API]]

![[./data/applications-wide.csv#Sheet1|A1:K61?caption=別紙2　申請一覧]]

別紙の一覧を確認するには、Markdownのソース（編集画面）を開き、VS Codeのコマンドパレットで`MMI: Generate Delivery Manifest`を実行します。

この文書の隣に作成される`08-release.delivery-manifest.csv`を開き、上の2ファイルが載っていることを確認してください。

このCSVは**同梱するファイルを確認するための一覧表**です。MMIが元データを自動的にコピーしたり、ZIPファイルにまとめたりするものではありません。実際の納品時には、必要な元ファイルを別途揃えてください。
