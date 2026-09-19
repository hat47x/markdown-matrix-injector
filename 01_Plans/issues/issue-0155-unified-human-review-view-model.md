# Issue: Proposal / Authority / Cognitive / Deterministicを分離したHuman Review View Modelを実装する

## Meta
- Type: Feature / Review UX contract
- Status: Open
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

入力:
- Cognitive Review Envelope
- `DeterministicReviewEvidenceSurfaceV1<..., ExecutableProposalVerifiedReviewSurfaceV1>`

生成時:
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

- [ ] `UnifiedHumanReviewViewModelV1` をpure TypeScriptで定義する。
- [ ] top-levelにoverall verdict / combined score / approval stateを持たない。
- [ ] proposalIdentityはsource digest / algorithm / representation / digestのみ。
- [ ] authorityはreview boundaryとAuthority verificationを保持する。
- [ ] cognitiveはPerception / Judgment / provenanceを保持し、Authorityを含めない。
- [ ] deterministicはproducer / reason / comparisonを保持し、Cognitive provider metadataを付与しない。
- [ ] issue-0154 attachment validationを投影時に再利用する。
- [ ] executable proposal surface schema / role / digest formatを再検証する。
- [ ] 4 sectionのsource identityを一致させる。
- [ ] Authority satisfiedでもCognitive/Deterministicをapproved/acceptedへ昇格しない。
- [ ] Authority blockedでもview modelを生成できる。
- [ ] input artifactsをmutateしない。
- [ ] raw Notation / cells / full feature arrays / workbook bytesを保持しない。
- [ ] production UI / provider / matcher / fill telemetry生成処理を変更しない。

## Validation plan

- valid satisfied surfaceから4 section view modelを生成。
- blocked Authority surfaceも正常に生成。
- proposal source digest改変を拒否。
- deterministic evidence source digest改変を拒否。
- review boundary改変を拒否。
- input不変を確認。
- serialized modelにraw Notation / cells / features / overallScore / combinedScore / apply / acceptedを含めない。
- GitHub Actionsの既知runner/resource不足は完了条件にしない。
