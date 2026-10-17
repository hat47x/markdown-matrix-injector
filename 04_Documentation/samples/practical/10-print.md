# 申請システム設計書

この例では、申請システムの設計書に、縦向きの概要、横向きの状態遷移表、別紙への参照を組み合わせます。元の設計データはExcelなどに置いたまま、Markdownから必要な内容を参照します。

画面上で表が読めることと、PDFで改ページや用紙の向きが意図どおりになることは別の確認事項です。印刷結果はPDF生成器でも確かめてください。

## レビューで残った項目

まず、判定台帳から「要確認」の3件を表示します。`columns=A,B,C`は、確認に使う列だけを表示する指定です。

![[./data/release.csv#Sheet1|A1:F11?header=first&columns=A,B,C&grep=要確認&caption=表1　残件一覧&id=open-items]]

詳しい業務の流れは、[表2の状態遷移](#workflow) から確認できます。これは文書内の表へのリンクです。

![[./data/design.xlsx#状態遷移|A1:F13?header=first&caption=表2　状態遷移&id=workflow&pageBreak=before&orientation=landscape]]

状態遷移は12件です。`pageBreak=before`は表の前で改ページする指定、`orientation=landscape`は横向きの用紙を示す指定です。これらは印刷用の情報であり、PDF生成器によって出力結果が異なる場合があるため、生成したPDFで確認します。

![[./data/design.xlsx?mode=card&caption=別紙1　設計データ&pageBreak=before&orientation=portrait]]

この参照は設計データを別紙カードとして表示します。`orientation=portrait`は縦向きの用紙を示します。

PDFを作るときは、表と別紙カードの表示を確認したうえで、改ページと縦・横・縦の配置を出力したPDFで確認してください。プレビューだけでは印刷結果を確認したことにはなりません。

**別紙のExcelも納品物へ同梱します。** PDFを作成しても、元のExcelファイルがPDFに内包されるわけではありません。
