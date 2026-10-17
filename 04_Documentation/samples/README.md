# Samples Index

このディレクトリには、MMIの説明や検証に使うサンプルをまとめています。最初に試す場合は[実務サンプルの案内](./practical/README.md)から始められます。本書では、用途に応じたサンプルの選び方と、既存の検証記録を確認する場所を案内します。


## Target reader
- 利用場面を説明する文書からサンプルを参照したい、技術文書の執筆者や設計担当者。
- 既存のExcelやCSVを使い続けながら、Markdownから表を参照する方法を試したい文書作成担当者。
- 投資対効果（ROI）の観測を再現し、導入判断の根拠を記録したい確認担当者や品質保証担当者。

## Prerequisites
- `samples/`内の相対リンクを開けるMarkdown閲覧環境。
- 実務サンプルの表を展開する場合は、MMIを利用できるVS Code環境を用意し、`practical/`のMarkdown文書と`data/`フォルダーを一緒に開くこと。操作の説明は[実務サンプルの案内](./practical/README.md)を参照。
- 投資対効果の検証（ROI Proof）を行う場合は、`phase6-roi/`にある利用前・利用後・観測手順の3文書と`roi-metrics-template.csv`を開けること。

## Asset naming and heading policy (Task 1)
- ファイル名は「`phase + purpose + state`」（段階・目的・状態）の組み合わせとし、利用場面から内容を推測できる粒度に揃える。
  - 例: `phase6-roi/before-state.md`, `phase6-roi/after-state.md`, `phase6-roi/observation-protocol.md`。
- 見出しの順序を「索引 → 観測方法 → 期待結果 → 制約」に揃え、見出しを指すリンクが再利用できるようにする。
- 利用場面を説明する文書から参照する際は、ファイルのパスだけでなく、見出しを指す`#...`付きのパスも正本として扱う。

## 1. 目的
- サンプルの利用目的、対応する利用場面、手順を一か所にまとめる。
- 利用場面を説明する本文から参照できるように、ファイル名と見出しのリンクを安定させる。

## 2. サンプル一覧

### 2.1 Scenario ROI Proof（Phase 6）
- ディレクトリ: `phase6-roi/`
- 対応シナリオ: Stream D「Scenario ROI Proof - サンプル導線化」
- 主な用途:
  - 利用前と利用後の比較観測（before/after）
  - 観測手順に従って再現できる測定
  - 投資対効果の判断根拠を残すための計測用ひな形

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
- [phase9-rule-table-pattern-guide.md](./phase9-rule-table-pattern-guide.md) — MMIがなくても読める標準ガイド（生成物）
- [phase9-rule-table-benchmark-pack.csv](./phase9-rule-table-benchmark-pack.csv) — 生成元 CSV（正本）
- 生成スクリプト: `01_Plans/tools/generate_phase9_pattern_guide.py`（`--check` でドリフト検知）
- 運用手順: [`../process/phase9-rule-table-template-operations.md`](../process/phase9-rule-table-template-operations.md)

### 2.4 Phase 8 Drools 参照パターン（MMI 内部機能のケーススタディ）
- [phase8-drools-inspired-system-design-patterns.csv](./phase8-drools-inspired-system-design-patterns.csv)
- 解説: [`../process/phase8-drools-inspired-table-patterns.md`](../process/phase8-drools-inspired-table-patterns.md)

### 2.5 監査記録（品質保証）
- [rendering-pipeline-audit-2026-07-15.md](./rendering-pipeline-audit-2026-07-15.md) — 描画処理について実データを横断して行った監査。issue-0106・0107と同様の不具合がないかを確認した記録

### 2.6 実務サンプル（申請・承認システム）
- [実務サンプル一覧](./practical/README.md) — 要件レビュー、状態遷移、試験確認、納品準備などの例。基本12本とCP932の追加例1本から選べます。
- [最初の表参照](./practical/01-first-table.md) — ExcelやCSVの元データを複製せず、必要な表をMarkdownから参照する流れを確認する入口です。
- [CP932のCSV例](./practical/13-cp932.md) — Windows由来の文字を含むCSVを扱う例。既存記録では自動テストは合格していますが、VS Code画面での実機確認は未完了です。

基本12本の過去の表示件数は[2026年9月9日の機械検証記録](../media/release-20260908/sample-verification.json)で確認できます。CP932の追加例はこの記録に含まれません。これらの過去の記録は、今回新たに動作確認したことを示すものではありません。

## 3. 最短利用手順（ROI Proof）
1. [投資対効果の検証案内](./phase6-roi/README.md#roi-proof-index)を開き、観測する範囲を確認する。
2. [利用前の状態](./phase6-roi/before-state.md#before-observation-method)で、利用前の状況を観測する。
3. [利用後の状態](./phase6-roi/after-state.md#after-observation-method)で、利用後の状況を観測する。
4. [観測手順](./phase6-roi/observation-protocol.md#observation-method)に従い、利用前後の差を判断する。
5. `roi-metrics-template.csv`に結果を記録し、導入判断の根拠として保管する。

## 4. 参照リンク一覧（Scenario 本文向け）
- 投資対効果の検証案内: `samples/phase6-roi/README.md#roi-proof-index`
- 利用前の観測: `samples/phase6-roi/before-state.md#before-observation-method`
- 利用後の観測: `samples/phase6-roi/after-state.md#after-observation-method`
- 観測プロトコル: `samples/phase6-roi/observation-protocol.md#observation-method`
- 期待観測結果: `samples/phase6-roi/observation-protocol.md#expected-observation-results`
- 制約: `samples/phase6-roi/observation-protocol.md#constraints`


## Expected result
- 利用者が目的に応じて実務サンプル・仕様確認用の例・ROI検証資料を選び、参照先と確認の範囲を区別できる。
- `samples/` 単体で、Scenario 側から直接リンクできる安定した参照先（命名・見出し・アンカー）が提供される。
- 利用者が前提条件と期待成果を先に把握し、観測手順へ迷わず遷移できる。

## Known limitations
- 本書はサンプルへの案内を目的とします。投資対効果の評価自体が統計的に妥当かどうかは、`phase6-roi/observation-protocol.md`に示した制約に左右されます。
- 将来、利用場面を追加する際も、同じファイル名と見出しの付け方に従って追記します。

## 5. スクリーンショット運用ルール（issue-0027）
### 5.1 保存先と命名
- 保存先: `04_Documentation/samples/screenshots/`
- 命名: `phase{n}-{topic}-{state}.svg` を基本とし、topic は `normal-embed` / `smart-fallback` / `print-control` のように機能を表す語を使う。

### 5.2 撮影条件（再現性担保）
- VS Codeの版、画面のテーマ、表示倍率を記録する。
- 参照した埋め込み記法（`![[...]]`）を同じ節に記録する。
- 画面で確認できる成功状態（表・カードの表示や印刷用の設定の反映など）を一行で添える。

### 5.3 再撮影トリガー
- Smart Fallbackの判定条件、印刷制御の設定項目、画面表示に使うクラス名が変更されたとき。
- メジャー版への更新や画面テーマの変更で、見やすさが大きく変わったとき。
- 文書の点検で、画像と本文の内容が一致していないと指摘されたとき。
