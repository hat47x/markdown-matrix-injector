# Phase 6 ROI Proof サンプル

<a id="roi-samples-index"></a>
## 0. 導線

このディレクトリは、`issue-0017-phase6-scenario-roi-proof` の「samples だけで再現可能な導線」を固定するための正本です。Scenario 本文を編集せず、以下の順序で観測を完結できます。

1. README（本書）
2. 利用前サンプル: [`before-state.md#roi-before-prerequisites`](./before-state.md#roi-before-prerequisites)
3. 利用後サンプル: [`after-state.md#roi-after-prerequisites`](./after-state.md#roi-after-prerequisites)
4. 観測プロトコル: [`observation-protocol.md#roi-observation-prerequisites`](./observation-protocol.md#roi-observation-prerequisites)
5. 記録テンプレート: [`roi-metrics-template.csv`](./roi-metrics-template.csv)

## 1. 前提
- 対象プロジェクトは SIer 設計書運用（レビュー、別紙参照、印刷/PDF納品）を含むこと。
- 同一規模・同種のドキュメント改訂タスクで、利用前/利用後を比較すること。
- 計測者ロール（設計担当、レビュー担当など）は利用前/利用後で固定すること。

## 2. 手順
1. [`before-state.md#roi-before-procedure`](./before-state.md#roi-before-procedure) を実行し、利用前値を取得する。
2. [`after-state.md#roi-after-procedure`](./after-state.md#roi-after-procedure) を実行し、利用後値を取得する。
3. [`observation-protocol.md#roi-observation-procedure`](./observation-protocol.md#roi-observation-procedure) に従って差分を判定する。
4. 結果を `roi-metrics-template.csv` に記録し、導入判断の証跡として保存する。

## 3. 期待結果
- 最低3観点（時間短縮・品質・監査容易性）で、利用前/利用後の差分を説明できる。
- `roi-metrics-template.csv` に定量値と補足メモが残り、意思決定に再利用できる。
- `04_Documentation/samples/phase6-roi/` 配下のみで再現手順が完結する。

## 4. 制約
- 本サンプルは意思決定用テンプレートであり、統計的有意性は保証しない。
- 効果量は文書規模、チーム習熟度、既存レビュー文化に依存する。
- 金額換算（ROI%）は組織ごとの単価・間接コスト定義で別途算出が必要。
