# 利用後サンプル（MMI運用）

Markdownの本文から既存の表を参照する運用を、利用前と比較するための手順として示します。ExcelやCSVの正本を廃止・上書きする必要はありません。以下は**期待効果を測るための例**であり、測定済みの結果ではありません。

<a id="roi-after-flow"></a>
## 0. 導線
- 前段（利用前）: [`before-state.md#roi-before-prerequisites`](./before-state.md#roi-before-prerequisites)
- 本書（利用後）: `after-state.md`
- 次段（判定）: [`observation-protocol.md#roi-observation-prerequisites`](./observation-protocol.md#roi-observation-prerequisites)
- 記録先: [`roi-metrics-template.csv`](./roi-metrics-template.csv)

<a id="roi-after-prerequisites"></a>
## 1. 前提
- 設計書本文は Markdown を使用する。
- 参照データは Excel/CSV/XML を正本としてリンク注入する。表として直接参照するXMLは、XML Spreadsheet 2003形式を想定する。一般的なXMLすべてに対応するという意味ではない。
- レビュー共有は Markdown/PDF を同一ソースから生成する。PDF化では先にMMIで参照を展開したHTMLを使う。VS CodeのMarkdown PDF拡張から直接出力する方法まで検証済みという意味ではない。

<a id="roi-after-procedure"></a>
## 2. 手順

### 観点A: レビュー準備工数（時間短縮）
1. Markdown本文を更新する。
2. `![[...]]` 記法で正本データを参照し、手動貼り付けを省略する。
3. プレビューで図表表示とリンク整合を確認してレビュー依頼する。
4. 準備開始からレビュー依頼送信までの時間（分）を記録する。

### 観点B: 参照不整合の発生率（品質）
1. Diagnostics でリンク切れ/シート不在を事前検出する。
2. レビュー指摘票で参照不整合件数を集計する。

Diagnosticsで検出できる参照先の問題と、業務上の内容が正しいかどうかは別です。画面で表が表示されても、選んだ条件や説明文が現在の正本と合うかをレビューで確かめます。

### 観点C: 監査時の追跡時間（監査容易性）
1. 注入記法から正本ファイルと範囲を特定する。
2. 同一Markdown上で根拠位置を提示する。
3. 回答に要した時間（分）を記録する。

<a id="roi-after-expected-results"></a>
## 3. 期待結果
以下は利用前との比較で検証する仮説です。実際の数値と、その差が生じた条件は観測プロトコルに従って記録します。

- 利用前比でレビュー準備時間の短縮を確認できる。
- 参照不整合を事前検知で低減できる傾向を確認できる。
- 監査質問への回答時間を短縮できることを示せる。

<a id="roi-after-constraints"></a>
## 4. 制約
- 導入初期は記法学習コストにより短期的に工数が増加する場合がある。
- 巨大表や特殊印刷要件では Smart Fallback/印刷設定への習熟が必要。
