# Issue: Cognitive review-only integration envelopeを実装する

## Meta
- Type: Feature / Integration experiment
- Status: Done
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

- [x] `CognitiveReviewEnvelope` をpure TypeScriptで定義する。
- [x] envelope dispositionは常に `review-only` で、自動apply/mutation APIを持たない。
- [x] Perception outcomeのsource digestをenvelopeのsource identityとして固定する。
- [x] visible candidate / winnerに対応するFormat Profileはすべて `approved` でなければならない。
- [x] Format Profileのfeature version / source profile / evidence contractがPerceptionと一致しなければfail-closedする。
- [x] Perceptionに存在するvisible candidateをapproved profile集合が欠く場合はfail-closedする。
- [x] optional Judgment outcomeは同じsource digestに由来しなければならない。
- [x] Judgment signalは既存contractどおり `proposal-only` でなければならない。
- [x] abstained / unsupported / unavailable Judgmentもreview envelopeへ保持できる。
- [x] Authority再検証checklistを明示し、完了済みとは扱わない。
- [x] 実際のworksheet adapter -> approved Format Profile -> matcher -> Perception -> Judgment -> envelopeのfocused integration testを追加する。
- [x] novel / no-candidate経路でapproved profileを強制しない。
- [x] matcher / worksheet-format-v6 / fill telemetry / external XLSX fixture / production runtimeを変更しない。

### Validation plan

- strict TypeScript compile。
- focused testsでmatched、ambiguous、novel/no-candidate、Judgment abstention、source digest mismatch、未承認Profile、candidate/Profile不足、profile互換性不一致を検証する。
- repository差分でfill telemetry / XLSX fixture / production runtimeに変更がないことを確認する。
- GitHub Actionsの既知runner/resource不足は完了条件にしない。


## Validation evidence

### 2026-09-19 local focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- strict compile: `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true` で成功。
- focused integration test: **8 tests / 8 pass / 0 fail**。
- branch上の対象moduleと既存Cognitive/worksheet-format契約をローカル検証環境へ再現し、以下の実経路を実行:
  - `WorksheetFormatSnapshot`
  - `worksheetFormatFeatureAdapter`
  - approved `FormatProfileV1`
  - `formatProfileToWorksheetPrototype`
  - `matchWorksheetFormatSnapshot`
  - `adaptWorksheetFormatMatchToCognitiveOutcome`
  - optional `adaptClosedChoiceResponse`
  - `createCognitiveReviewEnvelope`
- 確認内容は次のとおりです。
  - matched + Judgment decisionを `review-only / writeAuthority=none` で束ねる。
  - Authority revalidation requirementsは全件 `pending`。
  - always requirementは `source-identity / profile-compatibility`。
  - ambiguousの全visible candidateがapproved Format Profileへbindingされる。
  - candidate状態の未承認Profileを拒否。
  - visible candidateに対応するapproved Profile欠落を拒否。
  - Judgment source digest不一致を拒否。
  - Judgment abstentionをdecisionへ昇格せず保持。
  - novel / no-candidate経路ではProfileを強制しない。
  - Perceptionとreview source profile不一致を拒否。
- matcher / worksheet-format-v6 / fill telemetry / external XLSX fixture / production runtimeは変更していない。
- `experimental/README.md` は並行fill laneとの競合回避のため編集していない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
