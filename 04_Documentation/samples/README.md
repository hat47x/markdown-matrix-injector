# Samples Index

本ディレクトリは、MMI の検証・説明で再利用するサンプル群の導線をまとめるインデックスです。


## Target reader
- Scenario 文書からサンプル資産へリンクするテクニカルライター/設計担当。
- ROI 観測を再実行し、導入判断の証跡を残したいレビュー担当/QA 担当。

## Prerequisites
- `samples/` 配下の相対リンクを解決できる Markdown 閲覧環境。
- ROI Proof を実施する場合は、`phase6-roi/` の 3 文書（before/after/protocol）と `roi-metrics-template.csv` にアクセスできること。

## Asset naming and heading policy (Task 1)
- 命名は「`phase + purpose + state`」で固定し、Scenario から推測可能な粒度に統一する。
  - 例: `phase6-roi/before-state.md`, `phase6-roi/after-state.md`, `phase6-roi/observation-protocol.md`。
- 見出しは「インデックス → 観測方法 → 期待結果 → 制約」の順序で統一し、アンカー再利用性を担保する。
- Scenario からの参照先は、ファイルパスだけでなくアンカー付きパス（`#...`）を正本として扱う。

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

### 2.3 Phase 9 表パターンガイド（ツール非依存・ADR-0012 D7）
- [phase9-rule-table-pattern-guide.md](./phase9-rule-table-pattern-guide.md) — MMI 非依存で読める標準ガイド（生成物）
- [phase9-rule-table-benchmark-pack.csv](./phase9-rule-table-benchmark-pack.csv) — 生成元 CSV（正本）
- 生成スクリプト: `01_Plans/tools/generate_phase9_pattern_guide.py`（`--check` でドリフト検知）
- 運用手順: [`../phase9-rule-table-template-operations.md`](../phase9-rule-table-template-operations.md)

### 2.4 Phase 8 Drools 参照パターン（MMI 内部機能のケーススタディ）
- [phase8-drools-inspired-system-design-patterns.csv](./phase8-drools-inspired-system-design-patterns.csv)
- 解説: [`../phase8-drools-inspired-table-patterns.md`](../phase8-drools-inspired-table-patterns.md)

### 2.5 監査記録（品質保証）
- [rendering-pipeline-audit-2026-07-15.md](./rendering-pipeline-audit-2026-07-15.md) — レンダリングパイプライン実データ横断監査（issue-0106/0107 の同種欠陥有無確認）

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


## Expected result
- `samples/` 単体で、Scenario 側から直接リンクできる安定した参照先（命名・見出し・アンカー）が提供される。
- 利用者が前提条件と期待成果を先に把握し、観測手順へ迷わず遷移できる。

## Known limitations
- 本インデックスは導線提供が目的であり、ROI 評価そのものの統計妥当性は `phase6-roi/observation-protocol.md` の制約に依存する。
- 将来の Scenario 拡張時は、同じ命名/見出しポリシーに合わせた追記が必要。

## 5. スクリーンショット運用ルール（issue-0027）
### 5.1 保存先と命名
- 保存先: `04_Documentation/samples/screenshots/`
- 命名: `phase{n}-{topic}-{state}.svg` を基本とし、topic は `normal-embed` / `smart-fallback` / `print-control` のように機能を表す語を使う。

### 5.2 撮影条件（再現性担保）
- VSCode バージョン、テーマ、表示倍率（ズーム）を記録する。
- 参照した埋め込み記法（`![[...]]`）を同一セクションへ明記する。
- 画面で見えている「成功状態」が何か（例: 表表示、カード表示、印刷クラス反映）を1行で添える。

### 5.3 再撮影トリガー
- Smart Fallback 判定条件、印刷制御パラメータ仕様、UI 表示クラス名が変更されたとき。
- major バージョン更新やテーマ変更で視認性が著しく変わったとき。
- docs audit で「画像と本文の不整合」が指摘されたとき。
