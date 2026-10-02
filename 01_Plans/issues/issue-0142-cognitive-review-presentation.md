# Issue: Cognitive review presentation modelを実装する

## Meta
- Type: Feature / Review UX contract
- Status: Done
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
- Judgment: proposal-only decisionまたはabstained / unsupported / unavailable
- Provenance: provider identity、Format Profile approval reference、baseline source digest

異なるproviderのscoreを統合・正規化・総合点化しない。Perception候補順位も再計算しない。

### Acceptance criteria

- [x] UI非依存の `CognitiveReviewPresentationV1` をpure TypeScriptで定義する。
- [x] presentation schema versionとaudienceを固定する。
- [x] Authority / Perception / Judgment / Provenanceを別sectionとして保持する。
- [x] `writeAuthority=none` と `review-only` を明示する。
- [x] Authority revalidationはEnvelopeの順序・applicability・pending状態を保持する。
- [x] Perception candidate順位、winner、classification、noveltyScoreを変更しない。
- [x] candidateにapproved Format Profile label / approval referenceを対応付ける。
- [x] Fly固有scoreはprovider namespace / semanticsを保持し、他provider scoreと混ぜない。
- [x] Judgment signalは `proposal-only` として表示し、非decisionはreason codeを保持する。
- [x] Judgment provider scoreをPerception scoreと別groupで保持する。
- [x] raw worksheet cell / feature payloadをpresentationへ露出しない。
- [x] combined / overall / total scoreを作らない。
- [x] tampered Envelope（schema / disposition / write authority / candidate-profile binding / completed Authority check）をfail-closedする。
- [x] matched / ambiguous / novel / Judgment abstentionをfocused testで確認する。
- [x] production UI / VS Code extension / matcher / fill telemetry / external XLSX fixtureを変更しない。

### Validation plan

- strict TypeScript compile。
- issue-0141の実経路からEnvelopeを生成し、presentation投影をfocused testする。
- serialized presentationに `cells` / raw `features` / `apply` / `overallScore` 等が出ないことを確認する。
- repository差分で並行fill laneとproduction UIに変更がないことを確認する。
- GitHub Actionsの既知runner/resource不足は完了条件にしない。


## Validation evidence

### 2026-09-19 local focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- strict compile: `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true` で成功。
- focused integration test: **8 tests / 8 pass / 0 fail**。
- issue-0141と同じ実経路でreview envelopeを生成し、そのpresentation projectionを検証。
- 検証内容は次のとおりです。
  - Authority / Perception / Judgment / Provenanceを独立sectionへ投影。
  - `review-only / writeAuthority=none / applyStatus=not-authorized` を固定。
  - matched候補にapproved Profile label / approval referenceを結合。
  - ambiguous候補順位を維持しwinnerを捏造しない。
  - novel / no-candidateでProfile rowを生成しない。
  - Judgment abstentionをnon-decisionとして保持。
  - Perception metricsとJudgment metricsをprovider別sectionへ分離。
  - `overallScore / combinedScore / totalScore` を生成しない。
  - serialized presentationへ `cells / features / apply` と実セル値を露出しない。
  - completed Authority check、candidate/Profile binding改変、schema/disposition/writeAuthority改変をfail-closed。
- 初回strict compileで、non-decision分岐の `error` 除外がruntime checkのみでTypeScript narrowingになっていない問題を検出。明示的 `error` 分岐へ修正後、compile/testとも成功。
- production UI / VS Code extension / matcher / worksheet-format-v6 / fill telemetry / external XLSX fixtureは変更していない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
