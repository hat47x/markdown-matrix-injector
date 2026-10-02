# Issue: Proposal Identity付きVerified Review Surfaceを実装する

## Meta
- Type: Feature / Review integrity contract
- Status: Done
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

構成は次のとおりです。

- proposal identity section
  - source digest
  - algorithm / representation / proposal digest
- review
  - issue-0142 Cognitive Review Presentation
- authorityVerification
  - issue-0144 Authority Verification Overlay

生成時には次のとおりです。

1. issue-0147 `bindExecutableProposalAuthorityEvidence` で現在rawNotationとEvidenceを照合
2. issue-0144 `createVerifiedCognitiveReviewSurface` でPresentation + Receiptを照合
3. 両者のsource digest / Authority status一致を再確認
4. proposal identityだけを追加し、raw Notationは保持しない

### Acceptance criteria

- [x] `ExecutableProposalVerifiedReviewSurfaceV1` をpure TypeScriptで定義する。
- [x] proposal sectionは `role=executable-proposal-identity` を持つ。
- [x] proposal sectionはsource digest / algorithm / representation / digestだけを持ちraw Notationを保持しない。
- [x] issue-0147 binderを必ず通す。
- [x] issue-0144 verified surface生成を必ず通す。
- [x] Evidence bindingとAuthority overlayのstatusが不一致ならfail-closedする。
- [x] source digest不一致をfail-closedする。
- [x] exact proposal以外へのEvidence swapを拒否する。
- [x] Authority blockedでもproposal identity付きsurfaceを生成できる。
- [x] Authority satisfiedでもCognitive Judgment / Perceptionをapproved/acceptedへ昇格させない。
- [x] review sectionの `review-only / writeAuthority=none / applyStatus=not-authorized` を保持する。
- [x] raw cells / feature arrays / raw Notation / combined score / apply APIを追加しない。
- [x] Envelope / Presentation / Evidenceをmutateしない。
- [x] production UI / plugin / extension / matcher / fill telemetryを変更しない。

### Validation plan

- issue-0145〜0147経路で実Evidenceを生成しsurface化する。
- satisfied proposal、blocked proposal、proposal swap、source tampering、presentation tampering、入力不変性をfocused testする。
- serialized surfaceにraw Notation / cells / features / apply / overallScoreがないことを確認する。
- GitHub Actionsの既知runner/resource不足は完了条件にしない。


## Validation evidence

### 2026-09-19 local focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- issue-0145〜0148のcomposition sourceをstrict compile: `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true` で成功。
- focused runtime harness: **8 checks / 8 pass / 0 fail**。
- 検証内容は次のとおりです。
  - exact proposal identity付きsatisfied human-review surfaceを生成。
  - 同一source上の別proposalへのEvidence swapをproposal digest mismatchで拒否。
  - blocked Authority Evidenceでもproposal identityを保持したsurfaceを生成。
  - Presentation source digest改変を拒否。
  - Evidence source digest改変を拒否。
  - Envelope / Presentation / Evidenceをcomposition前後で不変に保持。
  - serialized surfaceにraw Notation、`mode=table`、raw `cells / features`、overall score、apply APIを含めない。
  - Authority `satisfied` でもCognitive reviewへaccepted / auto-apply semanticsを追加しない。
- issue-0147 binderとissue-0144 verified surface生成を両方通した後、source digestとAuthority statusの一致をcross-checkする。
- production UI / plugin / extension / matcher / fill telemetry / external-XLSX評価コードは変更していない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
