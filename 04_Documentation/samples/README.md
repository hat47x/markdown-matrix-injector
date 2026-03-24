# Samples Index

本ディレクトリは、MMI の検証・説明で再利用するサンプル群の導線をまとめるインデックスです。

## 1. 目的
- サンプルの利用目的、対応シナリオ、利用手順を 1 箇所に集約する。
- Scenario 本文から参照しやすい、安定したファイル名・アンカー導線を提供する。

## 2. サンプル一覧

### 2.1 Scenario ROI Proof（Phase 6）
- ディレクトリ: `phase6-roi/`
- 対応シナリオ: Stream D「Scenario ROI Proof - サンプル導線化」
- 主な用途:
  - 利用前/利用後（before/after）の比較観測
  - 観測プロトコルに基づく再現可能な測定
  - ROI 判断の根拠を残す計測テンプレート

関連ファイル:
1. [phase6-roi/README.md](./phase6-roi/README.md)
2. [phase6-roi/before-state.md](./phase6-roi/before-state.md)
3. [phase6-roi/after-state.md](./phase6-roi/after-state.md)
4. [phase6-roi/observation-protocol.md](./phase6-roi/observation-protocol.md)
5. [phase6-roi/roi-metrics-template.csv](./phase6-roi/roi-metrics-template.csv)

### 2.2 Full spec sample（既存）
- [mmi-full-spec-sample.md](./mmi-full-spec-sample.md)
- 生成スクリプト: [generate_mmi_full_spec_sample_xlsx.py](./generate_mmi_full_spec_sample_xlsx.py)

## 3. 最短利用手順（ROI Proof）
1. [ROI index](./phase6-roi/README.md#roi-proof-index) を開き、観測範囲を確認する。
2. [before-state](./phase6-roi/before-state.md#before-observation-method) で利用前観測を実施する。
3. [after-state](./phase6-roi/after-state.md#after-observation-method) で利用後観測を実施する。
4. [observation protocol](./phase6-roi/observation-protocol.md#observation-method) に従って差分判定する。
5. `roi-metrics-template.csv` に記録し、導入判断の根拠として保管する。

## 4. 参照リンク一覧（Scenario 本文向け）
- ROI 入口: `samples/phase6-roi/README.md#roi-proof-index`
- 利用前観測: `samples/phase6-roi/before-state.md#before-observation-method`
- 利用後観測: `samples/phase6-roi/after-state.md#after-observation-method`
- 観測プロトコル: `samples/phase6-roi/observation-protocol.md#observation-method`
- 期待観測結果: `samples/phase6-roi/observation-protocol.md#expected-observation-results`
- 制約: `samples/phase6-roi/observation-protocol.md#constraints`
