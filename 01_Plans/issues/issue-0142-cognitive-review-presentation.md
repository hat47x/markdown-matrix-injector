# Issue: Cognitive review presentation modelを実装する

## Meta
- Type: Feature / Review UX contract
- Status: Open
- Priority: High
- Scope: review-only presentation model, trust-role separation, provenance/metric projection, focused tests
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: requirements.md Phase 13
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md, issue-0141-cognitive-review-envelope.md
- Depends on: issue-0141 Done
- Parallel exclusion: fill telemetry / external-XLSX evaluation filesとproduction UIには触れない

## Execution Plan

### Proposed solution

`CognitiveReviewEnvelope` を、人間向けreview UIがそのまま利用できる**決定論的presentation model**へ投影する。

presentationは次を明確に分離する。

- Authority boundary: source identity / write authority / pending revalidation
- Perception: classification / ranked candidates / Fly固有metrics
- Judgment: proposal-only decision または abstained / unsupported / unavailable
- Provenance: provider identity、Format Profile approval reference、baseline source digest

異なるproviderのscoreを統合・正規化・総合点化しない。Perception候補順位も再計算しない。

### Acceptance criteria

- [ ] UI非依存の `CognitiveReviewPresentationV1` をpure TypeScriptで定義する。
- [ ] presentation schema versionとaudienceを固定する。
- [ ] Authority / Perception / Judgment / Provenanceを別sectionとして保持する。
- [ ] `writeAuthority=none` と `review-only` を明示する。
- [ ] Authority revalidationはEnvelopeの順序・applicability・pending状態を保持する。
- [ ] Perception candidate順位、winner、classification、noveltyScoreを変更しない。
- [ ] candidateにapproved Format Profile label / approval referenceを対応付ける。
- [ ] Fly固有scoreはprovider namespace / semanticsを保持し、他provider scoreと混ぜない。
- [ ] Judgment signalは `proposal-only` として表示し、非decisionはreason codeを保持する。
- [ ] Judgment provider scoreをPerception scoreと別groupで保持する。
- [ ] raw worksheet cell / feature payloadをpresentationへ露出しない。
- [ ] combined / overall / total scoreを作らない。
- [ ] tampered Envelope（schema / disposition / write authority / candidate-profile binding / completed Authority check）をfail-closedする。
- [ ] matched / ambiguous / novel / Judgment abstentionをfocused testで確認する。
- [ ] production UI / VS Code extension / matcher / fill telemetry / external XLSX fixtureを変更しない。

### Validation plan

- strict TypeScript compile。
- issue-0141の実経路からEnvelopeを生成し、presentation投影をfocused testする。
- serialized presentationに `cells` / raw `features` / `apply` / `overallScore` 等が出ないことを確認する。
- repository差分で並行fill laneとproduction UIに変更がないことを確認する。
- GitHub Actionsの既知runner/resource不足は完了条件にしない。
