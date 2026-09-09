# 要件レビュー

レビュー対象は申請・承認システムの24要件です。全件を貼り付けず、担当領域と未確認事項を分けて読みます。

## 認証・権限の4要件

![[./data/requirements.csv#Sheet1|A1:G25?header=first&grep=AUTH&caption=表1　AUTH領域&id=auth]]

## 未確認の5要件

![[./data/requirements.csv#Sheet1|A1:G25?header=first&columns=A,C,F,G&grep=要確認&highlightColumn=状況&highlightValue=要確認&caption=表2　次回レビューの対象]]

REQ-003、008、010、016、024が対象です。確認する試験番号も同じ行に表示します。
`columns`で残した列を対象に`grep`が働くため、検索したい「状況」列を残しています。

## 全件へ戻る

![[./data/requirements.csv#Sheet1|A1:G25?header=first&caption=表3　全要件]]

業務で使うときは、要件IDと試験IDを自社の識別子へ置き換えます。MMIは試験結果の正しさを判定しません。
