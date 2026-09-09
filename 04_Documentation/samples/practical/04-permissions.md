# 権限の比較

Excelの「権限」シートで12操作と4つの役割を比較します。「可」「不可」は架空の業務設計です。

![[./data/design.xlsx#権限|A1:F13?header=first&caption=表1　役割別の操作権限]]

## 承認者の担当範囲

![[./data/design.xlsx#権限|A1:F13?header=first&columns=A,B,D&caption=表2　承認者の操作]]

## 小さな表を縦横反転する

![[./data/design.xlsx#権限|B1:F4?transpose=true&header=first&caption=表3　役割を行に並べる]]

元の5列×4行が、4列×5行になります。先頭行を見出しにするので本文は4行です。
Excelの結合セル・配色・列幅は再現せず、セル値を読み取ってMMIの表として表示します。
