# 大きい表を読みやすくする

申請一覧には60件、11列があります。全体はカードになります。必要な列を選び、`mode=table`を付けて表として表示します。

## 全体は別紙として参照

![[./data/applications-wide.csv#Sheet1|A1:K61?caption=表1　申請一覧の全体]]

## 承認待ちの15件だけ表示

![[./data/applications-wide.csv#Sheet1|A1:K61?mode=table&header=first&columns=A,B,C,E&grep=承認待ち&caption=表2　承認待ち]]

## 必要な場合だけ強制的に展開

![[./data/applications-wide.csv#Sheet1|A1:K5?mode=table&header=first&caption=表3　先頭4件を全列で表示]]

`mode=table`はカード化を抑止します。カード化の判定は列の絞り込みより先なので、`columns`だけではカードのままです。全列を展開すると横に長い表になるため、見せたい列と範囲も一緒に絞ってください。
