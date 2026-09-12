# Issue: ハエ脳由来書式matcherの評価fixtureと採用ゲート固定

## Meta
- Type: Test
- Status: In Progress
- Priority: Medium
- Scope: `03_Implement/test/fixtures/fly-format-evaluation.json`, `03_Implement/test/flyInspiredFormatEvaluation.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: requirements.md Phase 1 / Phase 5 / Phase 11
- Related ADR/Spec: ADR-0017-fly-inspired-format-deviation-assistance.md
- Dependency: issue-0114 Done

## Execution Plan
### Proposed solution

実Workbookのstyle抽出へ進む前に、既知書式・軽微逸脱・識別特徴欠落・未知書式を機械可読fixtureとして固定する。`matchFormatObservation`を同一fixtureへ反復適用し、既知書式を正しく候補化できることと、未知・拮抗ケースを無理に既知書式へ寄せないことを採用ゲートにする。

fixtureは現実のExcelバイナリではなく、将来のExcel style adapterが出力すべき抽象特徴トークンを表す。これによりmatcher自体の性能と、style抽出性能を分離して評価できる。

### Acceptance criteria
- [ ] 少なくとも4種類のprototypeと、known / ambiguous / novelを含む12ケースをfixture化する。
- [ ] known 8ケースすべてで`matched`かつ期待winnerが一致する。
- [ ] novel 3ケースで誤った`matched`が0件である。
- [ ] 識別特徴が欠けて近接prototypeが拮抗する1ケースで`ambiguous`となりwinnerを返さない。
- [ ] 反復実行で結果が変化しない。
- [ ] fixtureは将来のstyle adapterから独立し、Workbook I/Oや製品経路を追加しない。
- [ ] ローカルstrict TypeScript検証とunit testが成功する。

### Task breakdown
- [x] prototypeと評価ケースをJSON fixtureへ定義する。
- [x] 集計指標と個別期待値を検証するunit testを追加する。
- [ ] ローカルで型検査・unit testを実行する。

### Validation plan

GitHub Actionsはリソース不足のため完了条件に含めない。ローカルで対象差分をstrict TypeScript条件で型検査し、コンパイル後のテストをNode test runnerで実行する。
