# Issue: Executable Proposal Verified Review workflowを一本化する

## Meta
- Type: Feature / Safe orchestration
- Status: Done
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

- [x] `prepareExecutableProposalVerifiedReviewWithLoader` を追加する。
- [x] 入力型にpresentation / receipt / evidenceを含めない。
- [x] presentationはEnvelopeから内部生成する。
- [x] Authority Evidenceは同一rawNotationとloader入力から内部生成する。
- [x] verified surfaceはissue-0148生成関数を必ず通す。
- [x] default loader版を追加する。
- [x] satisfied / blockedの双方でsurfaceを返す。
- [x] exact proposal digestをsurfaceへ保持する。
- [x] explicit cardでloader未呼出を維持する。
- [x] loader中source変更をblocked surfaceへ反映する。
- [x] raw Notation / raw cells / full featuresをsurfaceへ保存しない。
- [x] Envelopeをmutateしない。
- [x] production UI / plugin / extensionを変更しない。
- [x] fill telemetry / external-XLSX評価コードを変更しない。

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


## Validation evidence

### 2026-09-20 focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- GitHub正本の `executableProposalVerifiedReviewWorkflow.ts` と依存moduleの公開型/関数シグネチャを再取得して検証。
- workflow本体をinterface-compatibleな最小環境で `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true` でcompile成功。
- 前回検出した `createCognitiveReviewPresentation` 不足はローカルharness側のstub不足であり、GitHub正本には同関数が存在することを再確認。
- workflow固有のfocused runtime harness: **6 checks / 6 pass / 0 fail**。
- 確認内容:
  - `Presentation -> Authority Evidence -> Verified Surface` の固定呼出順。
  - loader経路のsatisfied結果をsurfaceへ透過。
  - card相当のload-free経路でloaderを呼ばない。
  - blocked Authority結果を例外化せずblocked surfaceとして透過。
  - Envelope入力をmutateしない。
  - default-loader workflowも `Presentation -> default Evidence -> Surface` の固定順を維持。
- issue-0150 repository test sourceには、実下位moduleを用いる以下のfocused integration caseを保持:
  - normal table -> satisfied
  - invalid known parameter -> blocked
  - explicit card -> loader未呼出
  - source change during load -> blocked
  - Envelope不変
  - raw Notation / cells / features / apply非保持
  - normal dependency環境でdefault loader + CSV
- 現ローカル環境にはGitHubへの直接network accessとproductionのpinned `xlsx` dependencyがないため、repository全体の実dependency integration test成功は主張しない。下位のloader/Authority境界はissue-0145〜0149で個別検証済み。
- production UI / plugin / extension / matcher / fill telemetry / external-XLSX評価コードは変更していない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
