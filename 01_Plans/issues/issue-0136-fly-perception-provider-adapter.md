# Issue: Fly-inspired matcherをPerception provider contractへ適合する

## Meta
- Type: Feature / Integration experiment
- Status: Draft
- Priority: High
- Scope: experimental cognitive provider adapter + focused tests
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: requirements.md Phase 13
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md, ADR-0017-fly-inspired-format-deviation-assistance.md
- Depends on: issue-0135 Done

## Execution Plan
### Proposed solution

既存`flyInspiredFormatMatcher` / worksheet-format-v6 matcherを変更せず、その結果をCognitive Contractへ写像する薄いPerception provider adapterを追加する。

`matched`はcandidate-ranking signal、`ambiguous`はambiguity / abstention、`novel`はnovelty signalへ写像する。既存confidence / DeviationScoreはprovider固有metricとして保持し、featureVersion / sourceProfileIdはprovenanceへ保持する。

### Acceptance criteria
- [ ] matcher本体を変更しない。
- [ ] `matched / ambiguous / novel`を情報損失なくCognitive Contractへ写像する。
- [ ] confidence / DeviationScoreをFly provider namespaceのmetricとして保持する。
- [ ] worksheet feature version / source profileをprovenanceへ保持する。
- [ ] ambiguous / novelを強制winnerへ変換しない。
- [ ] issue-0134までのfill判断を変更しない。
- [ ] production runtimeへ接続しない。
- [ ] focused regressionで既存候補順位とadapter結果の一致を確認する。

### Validation plan

issue-0135のcontract testに加え、既存worksheet-format fixtureからmatched / ambiguous / novel代表ケースを再利用し、scoreとstatusがadapter前後で変化しないことを確認する。
