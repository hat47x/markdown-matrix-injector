# Issue: Proposal Identity付きVerified Review Surfaceを実装する

## Meta
- Type: Feature / Review integrity contract
- Status: Open
- Priority: High
- Scope: executable proposal identity + cognitive review presentation + Authority overlay composition
- Expected verification level: unit + focused integration

## Traceability
- Related Backlog/Phase: requirements.md Phase 13
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md, issue-0144-authority-review-overlay.md, issue-0147-executable-proposal-authority-evidence.md
- Depends on: issue-0144 Done, issue-0147 Done
- Parallel exclusion: fill telemetry / external-XLSX / production VS Code UIには触れない

## Problem

issue-0144の `VerifiedCognitiveReviewSurfaceV1` はAuthority ReceiptをCognitive Reviewと別sectionで提示できるが、Receipt単体にはproposal identityがない。

issue-0147でexact proposalへのEvidence bindingを追加したため、human-review surfaceもそのproposal identityを保持しなければ、UI層でsource digestだけの関連付けへ後退する余地がある。

## Execution Plan

### Proposed solution

`ExecutableProposalVerifiedReviewSurfaceV1` を新設する。

構成:

- proposal identity section
  - source digest
  - algorithm / representation / proposal digest
- review
  - issue-0142 Cognitive Review Presentation
- authorityVerification
  - issue-0144 Authority Verification Overlay

生成時に:

1. issue-0147 `bindExecutableProposalAuthorityEvidence` で現在rawNotationとEvidenceを照合
2. issue-0144 `createVerifiedCognitiveReviewSurface` でPresentation + Receiptを照合
3. 両者のsource digest / Authority status一致を再確認
4. proposal identityだけを追加し、raw Notationは保持しない

### Acceptance criteria

- [ ] `ExecutableProposalVerifiedReviewSurfaceV1` をpure TypeScriptで定義する。
- [ ] proposal sectionは `role=executable-proposal-identity` を持つ。
- [ ] proposal sectionはsource digest / algorithm / representation / digestだけを持ちraw Notationを保持しない。
- [ ] issue-0147 binderを必ず通す。
- [ ] issue-0144 verified surface生成を必ず通す。
- [ ] Evidence bindingとAuthority overlayのstatusが不一致ならfail-closedする。
- [ ] source digest不一致をfail-closedする。
- [ ] exact proposal以外へのEvidence swapを拒否する。
- [ ] Authority blockedでもproposal identity付きsurfaceを生成できる。
- [ ] Authority satisfiedでもCognitive Judgment / Perceptionをapproved/acceptedへ昇格させない。
- [ ] review sectionの `review-only / writeAuthority=none / applyStatus=not-authorized` を保持する。
- [ ] raw cells / feature arrays / raw Notation / combined score / apply APIを追加しない。
- [ ] Envelope / Presentation / Evidenceをmutateしない。
- [ ] production UI / plugin / extension / matcher / fill telemetryを変更しない。

### Validation plan

- issue-0145〜0147経路で実Evidenceを生成しsurface化する。
- satisfied proposal、blocked proposal、proposal swap、source tampering、presentation tampering、入力不変性をfocused testする。
- serialized surfaceにraw Notation / cells / features / apply / overallScoreがないことを確認する。
- GitHub Actionsの既知runner/resource不足は完了条件にしない。
