# 要件レビュー

申請・承認システムの24件の要件を、担当領域と未確認事項に分けて読む例です。表全体を文書に貼り付けず、必要な行を元のCSVから表示します。

## 認証・権限の4要件

![[./data/requirements.csv#Sheet1|A1:G25?header=first&grep=AUTH&caption=表1　AUTH領域&id=auth]]

`grep=AUTH`は、「AUTH」という文字を含む行に絞る指定です。この例では、認証・権限に関する4件を表示します。

## 未確認の5要件

![[./data/requirements.csv#Sheet1|A1:G25?header=first&columns=A,C,F,G&grep=要確認&highlightColumn=状況&highlightValue=要確認&caption=表2　次回レビューの対象]]

確認対象はREQ-003、008、010、016、024の5件です。対応する試験番号も、それぞれの要件と同じ行に表示します。

`columns`は表示する列を選ぶ指定、`grep`は行に含まれる文字を探す指定です。検索は`columns`で列を選んだ後に行われるため、「要確認」を探すには「状況」列を残しておく必要があります。`highlightColumn`と`highlightValue`は、該当する値を強調表示するための指定です。

## 全件へ戻る

![[./data/requirements.csv#Sheet1|A1:G25?header=first&caption=表3　全要件]]

絞り込みを指定しなければ、24件の要件をまとめて確認できます。

実際の業務に使う場合は、要件IDと試験IDを自社の識別子に置き換えてください。MMIは要件を表示しますが、試験結果が正しいかどうかは判定しません。
