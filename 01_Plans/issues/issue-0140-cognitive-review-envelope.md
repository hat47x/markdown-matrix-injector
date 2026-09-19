# Issue: Cognitive review-only integration envelopeを実装する

## Meta
- Type: Feature / Integration experiment
- Status: Open
- Priority: High
- Scope: Cognitive Assistance Plane review envelope, provenance consistency, approved Format Profile binding, focused integration tests
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: requirements.md Phase 13
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md
- Depends on: issue-0135 Done, issue-0136 Done, issue-0137 Done, issue-0138 Done
- Parallel exclusion: issue-0139以降のfill telemetry / external-XLSX evaluation filesには触れない

## Execution Plan

### Proposed solution

Perception / Format Profile / Judgmentを、production適用権限を持たない `CognitiveReviewEnvelope` へ束ねる。

Envelopeは次を保持する。

- source digest
- Fly Perception outcome
- Perceptionに現れる候補と対応するapproved Format Profile参照
- optional closed-choice Judgment outcome
- Authority Planeで再検証すべきchecklist
- 明示的な `review-only` disposition

統合moduleはmatcher score、threshold、fill telemetry、Format Profile approval、Judgment decisionを再計算しない。各下位契約を検証し、provenanceを束ねるだけとする。

### Acceptance criteria

- [ ] `CognitiveReviewEnvelope` をpure TypeScriptで定義する。
- [ ] envelope dispositionは常に `review-only` で、自動apply/mutation APIを持たない。
- [ ] Perception outcomeのsource digestをenvelopeのsource identityとして固定する。
- [ ] visible candidate / winnerに対応するFormat Profileはすべて `approved` でなければならない。
- [ ] Format Profileのfeature version / source profile / evidence contractがPerceptionと一致しなければfail-closedする。
- [ ] Perceptionに存在するvisible candidateをapproved profile集合が欠く場合はfail-closedする。
- [ ] optional Judgment outcomeは同じsource digestに由来しなければならない。
- [ ] Judgment signalは既存contractどおり `proposal-only` でなければならない。
- [ ] abstained / unsupported / unavailable Judgmentもreview envelopeへ保持できる。
- [ ] Authority再検証checklistを明示し、完了済みとは扱わない。
- [ ] 実際の worksheet adapter -> approved Format Profile -> matcher -> Perception -> Judgment -> envelope のfocused integration testを追加する。
- [ ] novel / no-candidate経路でapproved profileを強制しない。
- [ ] matcher / worksheet-format-v6 / fill telemetry / external XLSX fixture / production runtimeを変更しない。

### Validation plan

- strict TypeScript compile。
- focused testsでmatched、ambiguous、novel/no-candidate、Judgment abstention、source digest mismatch、未承認Profile、candidate/Profile不足、profile互換性不一致を検証する。
- repository差分でfill telemetry / XLSX fixture / production runtimeに変更がないことを確認する。
- GitHub Actionsの既知runner/resource不足は完了条件にしない。
