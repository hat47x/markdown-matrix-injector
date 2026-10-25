# Issue: FlyHash風の疎表現による書式候補・逸脱判定のCPU試作

この文書は当時のIssue記録です。2026年9月12日のローカル検証では6テストが成功したと記録されています。一方、製品経路には未接続で、当時のGitHub Actionsはジョブ開始前に失敗したため、CI成功や製品機能の受入とは扱いません。

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/experimental/flyInspiredFormatMatcher.ts`, `03_Implement/test/flyInspiredFormatMatcher.test.ts`, `03_Implement/.vscodeignore`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: requirements.md Phase 1 / Phase 5 / Phase 11
- Related ADR/Spec: ADR-0017-fly-inspired-format-deviation-assistance.md, ADR-0012-mission-redefinition-notation-as-governance-boundary.md

## 当時の実行計画
### 解決方針（当時の提案）

既存のWorkbook読込み・パース・描画経路へ接続しない純粋TypeScriptモジュールとして、抽象化済み書式特徴トークンを疎な高次元署名へ写像し、既知prototypeとの類似度から候補順位、confidence、DeviationScoreを返す。上位候補はwinner-take-allで1件に絞るが、confidence不足は`novel`、上位差不足は`ambiguous`としてwinnerを返さない。

疎署名は乱数を使わない安定hashによる多重投影とtop-k activationで作る。最終confidenceは疎署名だけに依存させず、元の特徴集合の一致度も併用し、hash collisionがそのまま採用判定にならないようにする。

### 受入条件（Acceptance criteria）
- [x] 同じ特徴集合からは順序・重複に依存せず同じ疎署名が得られる。
- [x] 完全一致prototypeはconfidence 1、DeviationScore 0となり`matched`になる。
- [x] 1〜少数特徴の逸脱は候補として残り、完全に異なる特徴集合は既定閾値で`novel`になる。
- [x] 上位2候補が既定margin未満で拮抗する場合は`ambiguous`となり、winnerを返さない。
- [x] 空の観測は`novel`として扱い、自動的に既知書式へ寄せない。
- [x] 実装はファイルI/O、Workbook I/O、ネットワーク、外部API、モデル取得、正本変更を一切行わない。
- [x] `workbookLoader`、parser、renderer、VS Code extensionの既存経路から本モジュールを呼ばない。
- [x] 今回差分のstrict TypeScriptコンパイルとunit testがローカルで成功する。既存mainの回帰実績と組み合わせ、GitHub Actionsはリソース不足のため完了条件から除外する。

### 作業項目（Task breakdown）
- [x] 疎投影・特徴正規化・類似度の純粋関数を実装する。
- [x] WTA / novelty / ambiguity / DeviationScoreの結果型と判定を実装する。
- [x] 完全一致、軽微逸脱、未知、拮抗、順序/重複不変、空入力のunit testを追加する。
- [x] ローカルで差分コンパイルとunit testを実行し、結果を記録する。

### 当時の検証計画（Validation plan）

GitHub Actionsは2026-09-12時点でリソース不足によりジョブ本体が開始されないため、Human Sponsor指示によりローカル検証へ置き換える。

今回の差分は既存製品経路から未参照の実験モジュールとunit testに限定される。このため、以下を完了条件とする。

1. 新規ソースをrepo相当のstrict TypeScript条件（ES2022 / NodeNext / strict）でコンパイルする。
2. 新規testファイルを同じ条件で型検査する。
3. コンパイル済みコードに対して全6 unit testをNode test runnerで実行する。
4. `workbookLoader` / parser / renderer / extensionへの接続がないこと、VSIXからexperimental codeを除外していることを差分で確認する。
5. 既存mainの直近ローカル回帰実績をbaselineとし、今回差分の独立性と合わせて回帰リスクを判定する。

## Validation evidence

### 2026-09-12 local validation

- 実行環境: Node.js `v22.16.0`, npm `10.9.2`, TypeScript `5.8.3`。
- `flyInspiredFormatMatcher.ts` を `--strict --target ES2022 --module NodeNext --moduleResolution NodeNext` でコンパイルし成功。
- 実際の `flyInspiredFormatMatcher.test.ts` も同条件で型検査し成功。ローカル環境に`@types/node`が未導入のため、`node:test` / `node:assert/strict`だけを最小shimで宣言してテスト本文と製品コードの型整合を検証した。製品リポジトリ側には`@types/node` devDependencyが存在する。
- コンパイル後のunit testをNode test runnerで実行し、**6 tests / 6 pass / 0 fail**。
- 検証ケース: 順序・重複不変、完全一致、軽微逸脱、未知書式、上位候補拮抗、空観測。
- 既存製品経路には未接続。`03_Implement/.vscodeignore` に `dist/src/experimental/**` を追加し、採用ゲート前の実験コードをVSIXへ含めない。
- 最新main `01549441c3b3b1a50fa11625c7baacb954fa4e37` には、その変更時点のローカル検証としてbuild成功・233 tests合格の記録がある。今回差分はそこから独立した実験モジュール・test・計画文書・VSIX除外だけである。

### GitHub Actionsの扱い

push / pull_request CIはbuildジョブが`steps: []`のまま開始前に失敗する状態で、同じ状態が最新mainにも発生している。Human Sponsorから「GitHub側のリソース不足なのでローカル検証で代替」と指示されたため、CI成功を本Issueの完了条件から除外した。

このIssueでは製品経路への統合を行っていないため、次段階はExcel書式特徴adapterと評価fixtureを別Issueとして起票して進める。
