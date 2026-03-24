# 観測手順の裏付け（ROI Proof Protocol）

## 1. 観測設計
- 比較単位: 同種の設計書改訂タスク（利用前1件、利用後1件以上）。
- 観測期間: 同一フェーズ内（例: 1スプリント）に実施。
- 比較観点: 時間短縮 / 品質 / 監査容易性。

## 2. 計測手順

### Step A: 前提固定
1. ドキュメント規模（ページ数・表数）を記録。
2. 担当ロールとレビュー体制を固定。
3. 計測単位（分、件）を固定。

### Step B: 利用前計測
1. `before-state.md` の手順でタスク実行。
2. 計測値を `roi-metrics-template.csv` の `before_*` 列へ記録。

### Step C: 利用後計測
1. `after-state.md` の手順で同等タスク実行。
2. 計測値を `roi-metrics-template.csv` の `after_*` 列へ記録。

### Step D: 差分判定
1. 各指標の差分（after - before）を算出。
2. 定性的補足（改善要因 / 悪化要因）を `notes` 列に記載。

## 3. 判定ガイド
- 時間短縮: `after_review_prep_minutes < before_review_prep_minutes` なら改善。
- 品質: `after_reference_mismatch_count <= before_reference_mismatch_count` を目標。
- 監査容易性: `after_audit_trace_minutes < before_audit_trace_minutes` なら改善。

## 4. 期待結果
- 3観点すべてで利用前/利用後の差分説明が可能になる。
- 導入是非の判断に必要な根拠（定量 + 定性）が残る。

## 5. 制約
- サンプル数が少ない場合、偶然要因を十分に排除できない。
- ドキュメント難易度が揃わないと比較妥当性が低下する。
- 組織横断比較には、追加の正規化指標（人員、並行案件数等）が必要。
