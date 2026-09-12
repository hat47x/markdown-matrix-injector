# Issue: FlyHash風疎表現による書式候補・逸脱判定のCPU-only試作

## Meta
- Type: Feature
- Status: In Progress
- Priority: Medium
- Scope: `03_Implement/src/experimental/flyInspiredFormatMatcher.ts`, `03_Implement/test/flyInspiredFormatMatcher.test.ts`, `03_Implement/.vscodeignore`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: requirements.md Phase 1 / Phase 5 / Phase 11
- Related ADR/Spec: ADR-0017-fly-inspired-format-deviation-assistance.md, ADR-0012-mission-redefinition-notation-as-governance-boundary.md

## Execution Plan
### Proposed solution

既存のWorkbook読込み・パース・描画経路へ接続しない純粋TypeScriptモジュールとして、抽象化済み書式特徴トークンを疎な高次元署名へ写像し、既知prototypeとの類似度から候補順位、confidence、DeviationScoreを返す。上位候補はwinner-take-allで1件に絞るが、confidence不足は`novel`、上位差不足は`ambiguous`としてwinnerを返さない。

疎署名は乱数を使わない安定hashによる多重投影とtop-k activationで作る。最終confidenceは疎署名だけに依存させず、元の特徴集合の一致度も併用し、hash collisionがそのまま採用判定にならないようにする。

### Acceptance criteria
- [x] 同じ特徴集合からは順序・重複に依存せず同じ疎署名が得られる。
- [x] 完全一致prototypeはconfidence 1、DeviationScore 0となり`matched`になる。
- [x] 1〜少数特徴の逸脱は候補として残り、完全に異なる特徴集合は既定閾値で`novel`になる。
- [x] 上位2候補が既定margin未満で拮抗する場合は`ambiguous`となり、winnerを返さない。
- [x] 空の観測は`novel`として扱い、自動的に既知書式へ寄せない。
- [x] 実装はファイルI/O、Workbook I/O、ネットワーク、外部API、モデル取得、正本変更を一切行わない。
- [x] `workbookLoader`、parser、renderer、VS Code extensionの既存経路から本モジュールを呼ばない。
- [ ] TypeScript buildと既存を含む自動テストが成功する。

### Task breakdown
- [x] 疎投影・特徴正規化・類似度の純粋関数を実装する。
- [x] WTA / novelty / ambiguity / DeviationScoreの結果型と判定を実装する。
- [x] 完全一致、軽微逸脱、未知、拮抗、順序/重複不変、空入力のunit testを追加する。
- [ ] 既存回帰テストとbuildを実行し、結果を記録する。

### Validation plan

`03_Implement` で以下を実行する。

```bash
npm run build
npm test
```

加えてCIのbuild / release-gate / packageを確認する。測定・実行していない結果は完了根拠にしない。

## Validation evidence

### 2026-09-12 isolated smoke check

- 新規モジュール単体をTypeScript 5.8.3 / Node.js 22.16.0で`--strict --target ES2022 --module NodeNext --moduleResolution NodeNext`としてコンパイルし成功。
- 完全一致、軽微逸脱、未知、拮抗、順序/重複不変、空入力の6ケースを隔離実行し成功。
- これはリポジトリ全体の`npm run build` / `npm test`の代替とは扱わない。

### GitHub Actions blocker

- push CI run `34686635252`: buildが実行ステップ開始前に失敗。再実行でも`steps: []`のまま失敗し、release-gate/packageはskip。
- Draft PR #154 のpull_request CI run `34686754371`: 同じくbuildが実行ステップ開始前に失敗し、release-gate/packageはskip。
- 比較対象の最新main commit `01549441c3b3b1a50fa11625c7baacb954fa4e37` のCI run `34420509896` でも同じ`steps: []`のbuild失敗を確認。

以上から、現時点では今回のコードに到達する前のCI実行環境側ブロッカーと扱う。リポジトリ全体のbuild/testを実行できるまではStatusを`Done`へ変更せず、PRもDraftのまま維持する。
