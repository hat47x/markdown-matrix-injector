# Issue: Fly-inspired matcherの結果をPerception provider契約へ対応付ける

この文書は2026年9月19日の実験用adapterに関する履歴記録である。**Fly-inspired matcher**は書式特徴から候補を比較する既存の照合部品、**Perception provider**は観測・照合結果を認知支援用の契約へ渡す部品、**adapter**は両者のデータ形式を対応付ける薄い変換層を指す。**confidence**はmatcher固有の類似度、**DeviationScore**は書式の差を表す指標、**provenance**はfeature versionやsource profileを含む出典情報である。既存の順位とスコアを保持したfocused testの成功は、production経路への接続を意味しない。

## Meta
- Type: Feature / Integration experiment
- Status: Done
- Priority: High
- Scope: experimental cognitive provider adapter + focused tests
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: requirements.md Phase 13
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md, ADR-0017-fly-inspired-format-deviation-assistance.md
- Depends on: issue-0135 Done

## 当時の実行計画
### 解決方針（当時の提案）

既存`flyInspiredFormatMatcher` / worksheet-format-v6 matcherを変更せず、その結果をCognitive Contractへ写像する薄いPerception provider adapterを追加する。

`matched`はcandidate-ranking signal、`ambiguous`はambiguity / abstention、`novel`はnovelty signalへ写像する。既存confidence / DeviationScoreはprovider固有metricとして保持し、featureVersion / sourceProfileIdはprovenanceへ保持する。

### 受入条件（Acceptance criteria）
- [x] matcher本体を変更しない。
- [x] `matched / ambiguous / novel`を情報損失なくCognitive Contractへ写像する。
- [x] confidence / DeviationScoreをFly provider namespaceのmetricとして保持する。
- [x] worksheet feature version / source profileをprovenanceへ保持する。
- [x] ambiguous / novelを強制winnerへ変換しない。
- [x] issue-0134までのfill判断を変更しない。
- [x] production runtimeへ接続しない。
- [x] focused regressionで既存候補順位とadapter結果の一致を確認する。

### 当時の検証計画（Validation plan）

issue-0135のcontract testに加え、既存worksheet-format fixtureからmatched / ambiguous / novel代表ケースを再利用し、scoreとstatusがadapter前後で変化しないことを確認する。


## Validation evidence

### 2026-09-19 local focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- strict compile: `--strict --target ES2022 --module NodeNext --moduleResolution NodeNext` で成功。
- focused integration test: **5 tests / 5 pass / 0 fail**。
- 実際の `worksheetFormatFeatureAdapter` → `worksheetFormatPrototype` → `flyInspiredFormatMatcher` 経路を通して確認。
- 次の結果と境界を検証した。
  - `matched`: winner、候補順位、confidence、noveltyScoreを変更せず写像。
  - `ambiguous`: 候補を保持し、winnerを生成しない。
  - `novel`: novelty signalへ写像し、winnerを生成しない。
  - feature version / source profile / source evidenceを保持。
  - Fly固有scoreを `mmi.fly-worksheet-format` namespaceで保持。
  - feature version / source profile不一致をfail-closed。
- 初回strict compileで、adapterが常にsignalを返すにもかかわらず戻り型を全`CognitiveOutcome`へ広げていた型不整合を検出。戻り型を`CognitiveSignalOutcome`へ狭めて修正後、全テスト成功。
- `flyInspiredFormatMatcher.ts`、`worksheetFormatFeatureAdapter.ts`、`worksheetFormatPrototype.ts`、threshold、fill評価ロジックは変更していない。
- production runtimeへのimport/接続は追加していない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
