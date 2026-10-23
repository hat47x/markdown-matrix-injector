# Issue: 書式matcherの評価fixtureと採用判定条件の固定

この文書は当時のIssue記録です。2026年9月12日のローカル検証で5テスト成功と記録されています。評価対象は抽象特徴トークンのfixtureであり、実Workbookの書式抽出や製品経路の実証ではありません。

## Meta
- Type: Test
- Status: Done
- Priority: Medium
- Scope: `03_Implement/test/fixtures/fly-format-evaluation.json`, `03_Implement/test/flyInspiredFormatEvaluation.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: requirements.md Phase 1 / Phase 5 / Phase 11
- Related ADR/Spec: ADR-0017-fly-inspired-format-deviation-assistance.md
- Dependency: issue-0114 Done

## 当時の実行計画
### 解決方針（当時の提案）

実Workbookのstyle抽出へ進む前に、既知書式・軽微逸脱・識別特徴欠落・未知書式を機械可読fixtureとして固定する。`matchFormatObservation`を同一fixtureへ反復適用し、既知書式を正しく候補化できることと、未知・拮抗ケースを無理に既知書式へ寄せないことを採用ゲートにする。

fixtureは現実のExcelバイナリではなく、将来のExcel style adapterが出力すべき抽象特徴トークンを表す。これによりmatcher自体の性能と、style抽出性能を分離して評価できる。

### 受入条件（Acceptance criteria）
- [x] 少なくとも4種類のprototypeと、known / ambiguous / novelを含む12ケースをfixture化する。
- [x] known 8ケースすべてで`matched`かつ期待winnerが一致する。
- [x] novel 3ケースで誤った`matched`が0件である。
- [x] 識別特徴が欠けて近接prototypeが拮抗する1ケースで`ambiguous`となりwinnerを返さない。
- [x] 反復実行で結果が変化しない。
- [x] fixtureは将来のstyle adapterから独立し、Workbook I/Oや製品経路を追加しない。
- [x] ローカルstrict TypeScript検証とunit testが成功する。

### 作業項目（Task breakdown）
- [x] prototypeと評価ケースをJSON fixtureへ定義する。
- [x] 集計指標と個別期待値を検証するunit testを追加する。
- [x] ローカルで型検査・unit testを実行する。

### 当時の検証計画（Validation plan）

GitHub Actionsはリソース不足のため完了条件に含めない。ローカルで対象差分をstrict TypeScript条件で型検査し、コンパイル後のテストをNode test runnerで実行する。

## Validation evidence

### 2026-09-12 local validation

- 実行環境: Node.js `v22.16.0`, npm `10.9.2`, TypeScript `5.8.3`。
- `flyInspiredFormatMatcher.ts` と `flyInspiredFormatEvaluation.test.ts` を `--strict --target ES2022 --module NodeNext --moduleResolution NodeNext` で型検査・コンパイルし成功。
- bare環境に`@types/node`がないため、`node:test` / `node:assert/strict` / `node:fs`だけ最小shimを用いた。製品リポジトリには`@types/node` devDependencyが存在する。
- コンパイル後の評価testをNode test runnerで実行し、**5 tests / 5 pass / 0 fail**。
- fixture内訳: prototype 4、case 12（known 8 / ambiguous 1 / novel 3）。
- known 8/8で期待winner一致、novel 3/3で誤accept 0、ambiguous 1/1でwinnerなし。
- 全ケースを10回反復して結果JSONが完全一致し、決定性を確認。

このfixtureを次段階のExcel style feature adapterの受入ゲートとして再利用する。
