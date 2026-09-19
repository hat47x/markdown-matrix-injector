# Issue: Executable Proposal Verified Review workflowを一本化する

## Meta
- Type: Feature / Safe orchestration
- Status: Open
- Priority: High
- Scope: envelope -> presentation -> loader Authority evidence -> verified review surface
- Expected verification level: unit + focused integration

## Traceability
- Related Backlog/Phase: requirements.md Phase 13
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md, issue-0148, issue-0149
- Depends on: issue-0148 Done, issue-0149 Done
- Parallel exclusion: production VS Code UI / fill telemetry / external-XLSX評価ロジックには触れない

## Problem

issue-0148までで安全なverified review surfaceは定義済みだが、呼出側がpresentation / evidence / surfaceを個別に組み立てる必要がある。

UI層がこの組立責務を持つと、将来一部の検証を飛ばしたり、別proposalのEvidenceを誤結合する実装余地が残る。

## Execution Plan

### Proposed solution

`prepareExecutableProposalVerifiedReviewWithLoader` を単一の安全な入口とする。

入力:
- Cognitive Review Envelope
- raw Notation proposal
- Markdown file path / workspace root
- Authority issuer
- optional URI scheme
- Workbook loader port

内部でのみ:
1. `createCognitiveReviewPresentation(envelope)`
2. `runExecutableProposalAuthorityEvidenceWithLoader(...)`
3. `createExecutableProposalVerifiedReviewSurface(...)`

を順に実行する。

呼出側はPresentation / Receipt / Evidenceを注入できない。

default loader版はissue-0149のproduction loader bridgeを再利用する。

### Acceptance criteria

- [ ] `prepareExecutableProposalVerifiedReviewWithLoader` を追加する。
- [ ] 入力型にpresentation / receipt / evidenceを含めない。
- [ ] presentationはEnvelopeから内部生成する。
- [ ] Authority Evidenceは同一rawNotationとloader入力から内部生成する。
- [ ] verified surfaceはissue-0148生成関数を必ず通す。
- [ ] default loader版を追加する。
- [ ] satisfied / blockedの双方でsurfaceを返す。
- [ ] exact proposal digestをsurfaceへ保持する。
- [ ] explicit cardでloader未呼出を維持する。
- [ ] loader中source変更をblocked surfaceへ反映する。
- [ ] raw Notation / raw cells / full featuresをsurfaceへ保存しない。
- [ ] Envelopeをmutateしない。
- [ ] production UI / plugin / extensionを変更しない。
- [ ] fill telemetry / external-XLSX評価コードを変更しない。

### Validation plan

- injected loaderで正常table proposal -> satisfied surface。
- invalid known parameter -> blocked surface。
- card proposal -> loader未呼出。
- loaderによるsource変更 -> blocked surface。
- exact proposal identityを確認。
- Envelope不変を確認。
- serialized surfaceのraw Notation非保持を確認。
- default loader wrapperは通常dependency環境向けtestを追加する。
- GitHub Actionsの既知runner/resource不足は完了条件にしない。
