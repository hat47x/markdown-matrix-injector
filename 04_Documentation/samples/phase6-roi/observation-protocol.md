# 観測手順の裏付け（ROI Proof Protocol）

<a id="roi-observation-flow"></a>
## 0. 導線
- 前段（利用前）: [`before-state.md#roi-before-prerequisites`](./before-state.md#roi-before-prerequisites)
- 前段（利用後）: [`after-state.md#roi-after-prerequisites`](./after-state.md#roi-after-prerequisites)
- 本書（観測プロトコル）: `observation-protocol.md`
- 記録先: [`roi-metrics-template.csv`](./roi-metrics-template.csv)

<a id="roi-observation-prerequisites"></a>
## 1. 前提
- 比較単位は同種の設計書改訂タスク（利用前1件、利用後1件以上）とする。
- 観測期間は同一フェーズ（例: 1スプリント）内に揃える。
- 比較観点は「時間短縮 / 品質 / 監査容易性」の3点を固定する。
- 記録フォーマットは `roi-metrics-template.csv` を使用する。

<a id="roi-observation-procedure"></a>
## 2. 手順

### Step 1: 条件固定
1. ドキュメント規模（ページ数・表数）を記録する。
2. 担当ロールとレビュー体制を固定する。
3. 計測単位（分、件）を固定する。

### Step 2: 利用前計測
1. `before-state.md#roi-before-procedure` の手順でタスクを実行する。
2. `roi-metrics-template.csv` の `before_*` 列に記録する。

### Step 3: 利用後計測
1. `after-state.md#roi-after-procedure` の手順で同等タスクを実行する。
2. `roi-metrics-template.csv` の `after_*` 列に記録する。

### Step 4: 差分判定
1. 各指標の差分（after - before）を算出する。
2. 改善要因/悪化要因を `notes` 列へ記載する。
3. `expected_result` と `constraints` を使って導入判断メモを残す。

<a id="roi-observation-expected-results"></a>
## 3. 期待結果
- 3観点すべてで、利用前/利用後の差分を定量・定性の両面で説明できる。
- 導入是非の判断に必要な根拠（測定値 + 観測メモ）が残る。
- samples 配下のみで、Scenario 本文を編集せずに再実行できる。

<a id="roi-observation-constraints"></a>
## 4. 制約
- サンプル数が少ない場合、偶然要因を十分に排除できない。
- ドキュメント難易度が揃わないと比較妥当性が低下する。
- 組織横断比較では正規化指標（人員、並行案件数など）の追加が必要。
- ROI% の金額換算は組織の単価・間接コスト定義に依存する。
