# 利用前サンプル（従来運用）

<a id="roi-before-flow"></a>
## 0. 導線
- 前段: [`README.md#0-導線`](./README.md#0-%E5%B0%8E%E7%B7%9A)
- 本書（利用前）: `before-state.md`
- 次段（利用後）: [`after-state.md#roi-after-prerequisites`](./after-state.md#roi-after-prerequisites)
- 仕上げ（判定）: [`observation-protocol.md#roi-observation-prerequisites`](./observation-protocol.md#roi-observation-prerequisites)

<a id="roi-before-prerequisites"></a>
## 1. 前提
- 設計書本文は Word を使用する。
- 参照データは Excel/CSV を別ファイルで管理し、手動参照する。
- レビュー共有は PDF 化してメール/チャットで配布する。

<a id="roi-before-procedure"></a>
## 2. 手順

### 観点A: レビュー準備工数（時間短縮）
1. Word本文を最新化する。
2. Excel から参照表をコピーし、整形貼り付けする。
3. 図表番号と本文参照を手動修正する。
4. 準備開始からレビュー依頼送信までの時間（分）を記録する。

### 観点B: 参照不整合の発生率（品質）
1. レビュー指摘票から「参照先誤り」「古い表の貼付」を抽出する。
2. 1ドキュメントあたりの不整合件数をカウントする。

### 観点C: 監査時の追跡時間（監査容易性）
1. 監査質問（例: 「この表の正本は何か」）を受領する。
2. 正本ファイル、更新者、根拠箇所を収集する。
3. 回答に要した時間（分）を記録する。

<a id="roi-before-expected-results"></a>
## 3. 期待結果
- 手作業依存が大きく、修正回数に比例して準備工数が増える傾向を確認できる。
- 参照不整合がレビュー後半で発見されるリスクを可視化できる。
- 監査時に正本追跡へ時間がかかる傾向を示せる。

<a id="roi-before-constraints"></a>
## 4. 制約
- 文書テンプレート差異により、工数の絶対値はチームごとに変動する。
- 既存運用で連携マクロ等を導入済みの場合、差分が小さく見える可能性がある。
