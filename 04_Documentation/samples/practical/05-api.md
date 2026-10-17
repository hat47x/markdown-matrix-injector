# APIの応答例

システム間で情報をやり取りするための窓口を、APIと呼びます。この例では、APIの設計情報10件から、情報の取得に使う「GET」の4件を表示します。

応答例は説明用のJSONであり、実在するサービスには接続しません。JSONは、項目名と値を組み合わせて情報を記すテキスト形式です。

![[./data/api.csv#Sheet1|A1:E11?header=first&grep=GET&formatColumn=応答例:json&caption=表1　参照API]]

`grep=GET`は、「GET」を含む行に絞る指定です。`formatColumn=応答例:json`は、「応答例」列をJSONのコードとして読みやすく表示する指定です。

## 差戻しの応答

次はExcelの「API」シートから、`API-07`に関する1件を表示します。

![[./data/design.xlsx#API|A1:E11?header=first&grep=API-07&formatColumn=応答例:json&caption=表2　差戻し結果]]

応答例に含まれる日本語や引用符も、JSONのコード表示で確認できます。MMIが行うのは記録済みの文字列の表示だけで、APIを実行したり、サービスに応答を問い合わせたりはしません。
