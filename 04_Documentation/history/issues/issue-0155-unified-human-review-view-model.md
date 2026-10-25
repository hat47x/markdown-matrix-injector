# Issue: Proposal / Authority / Cognitive / Deterministicを分離したHuman Review View Modelを実装する

## Meta
- Type: Feature / Review UX contract
- Status: Done
- Priority: High
- Scope: final UI-neutral projection for proposal-bound deterministic review evidence
- Expected verification level: unit + focused composition

## Traceability
- Related Backlog/Phase: requirements.md Phase 13
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md
- Depends on: issue-0148 Done, issue-0154 Done
- Parallel exclusion: production VS Code UI / provider invocation / matcher / fill telemetry生成ロジックは変更しない

## Problem

issue-0148でproposal identity + Cognitive review + Authority verificationを、
issue-0154でdeterministic review evidenceを、それぞれ安全なartifactとして分離できた。

ただしUI側がnested surfaceを直接読むと、以下を独自に混ぜる余地が残る。

- Authorityのsatisfied/blocked
- Cognitive Perception/Judgment
- deterministic review reason
- exact proposal identity

最終表示用のUI-neutral modelで4領域を明示的に分離し、総合AIスコアや総合判定を作らない境界が必要。

## Execution Plan

`UnifiedHumanReviewViewModelV1` を追加する。

入力は次のとおりです。
- Cognitive Review Envelope
- `DeterministicReviewEvidenceSurfaceV1<..., ExecutableProposalVerifiedReviewSurfaceV1>`

生成時は次のとおりです。
1. issue-0154 `createDeterministicReviewEvidenceSurface` を再実行しattachment-time validationを通す。
2. executable proposal surface schema / proposal identity / source digestを再検証。
3. review-only / no-write / not-authorized boundaryを再確認。
4. 4 sectionへcopy projectionする。

sections:
- proposalIdentity
- authority
- cognitive
- deterministic

## Acceptance criteria

- [x] `UnifiedHumanReviewViewModelV1` をpure TypeScriptで定義する。
- [x] top-levelにoverall verdict / combined score / approval stateを持たない。
- [x] proposalIdentityはsource digest / algorithm / representation / digestのみ。
- [x] authorityはreview boundaryとAuthority verificationを保持する。
- [x] cognitiveはPerception / Judgment / provenanceを保持し、Authorityを含めない。
- [x] deterministicはproducer / reason / comparisonを保持し、Cognitive provider metadataを付与しない。
- [x] issue-0154 attachment validationを投影時に再利用する。
- [x] executable proposal surface schema / role / digest formatを再検証する。
- [x] 4 sectionのsource identityを一致させる。
- [x] Authority satisfiedでもCognitive/Deterministicをapproved/acceptedへ昇格しない。
- [x] Authority blockedでもview modelを生成できる。
- [x] input artifactsをmutateしない。
- [x] raw Notation / cells / full feature arrays / workbook bytesを保持しない。
- [x] production UI / provider / matcher / fill telemetry生成処理を変更しない。

## Validation plan

- valid satisfied surfaceから4 section view modelを生成。
- blocked Authority surfaceも正常に生成。
- proposal source digest改変を拒否。
- deterministic evidence source digest改変を拒否。
- review boundary改変を拒否。
- input不変を確認。
- serialized modelにraw Notation / cells / features / overallScore / combinedScore / apply / acceptedを含めない。
- GitHub Actionsの既知runner/resource不足は完了条件にしない。


## Validation evidence

### 2026-09-20 focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- GitHub正本のissue-0148 / 0154公開型・schema constantsを再取得して0155の依存境界を照合。
- `unifiedHumanReviewViewModel.ts` をinterface-compatibleな依存境界で
  `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true`
  でcompile成功。
- focused runtime harness: **9 checks / 9 pass / 0 fail**。
- 確認内容は次のとおりです。
  - Proposal Identity / Authority / Cognitive / Deterministicの4領域へ分離。
  - Authority `satisfied` を独立sectionとして保持し、overall verdictを生成しない。
  - Authority `blocked` でもCognitive classificationを変更せずreview可能。
  - proposal source identity改変をfail-closed。
  - deterministic evidence source identity改変をissue-0154再validationでfail-closed。
  - review-only/no-write boundary改変をfail-closed。
  - deterministic wrapper audience改変を拒否。
  - Cognitive Presentation schema / Authority Overlay schema改変を拒否。
  - input artifactsをmutateしない。
  - serialized modelにraw `cells / features`、raw Notation相当、`overallScore / combinedScore / accepted / approved / apply / canApply` を含めない。
- 初回fixture照合で `CognitiveObservationRef` に存在しない余剰 `kind` fieldを検出し、test fixtureのみ修正。
- issue-0154 `createDeterministicReviewEvidenceSurface` をprojection時に再実行し、既存deterministic attachment validationを複製せず再利用。
- production UI / provider invocation / matcher / fill telemetry生成処理 / external-XLSX評価コードは変更していない。
- 現ローカル最小環境にはrepository dependency treeがないため、repository全test suite成功は主張しない。0155固有moduleのstrict API整合とruntime projection境界をfocusedに検証。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
