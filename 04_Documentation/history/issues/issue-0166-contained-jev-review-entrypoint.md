# Issue: Jev worksheet review-routeをContained Unified Reviewへ固定entrypointで接続する

## Meta
- Type: Feature / Provider-specific safe orchestration
- Status: Done
- Priority: High
- Scope: issue-0165 canonical Jev route provider -> issue-0163 provider-backed contained review
- Expected verification level: unit + focused composition
- Production runtime: 変更しない

## Traceability
- Depends on: issue-0163 Done
- Depends on: issue-0165 Done
- Related: issue-0164 Worksheet Format Observation Identity
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md

## Problem

issue-0163はprovider-neutralなためcallerがprovider / question / allowExternalを指定できる。
issue-0165はMMI固有Jev review-route provider / question / state minimizationを固定した。

両者をcallerが毎回手作業で組み合わせると:
- canonical questionを差し替える
- generic Jev providerを別state projectorで作る
- allowExternalを曖昧に扱う
余地が残る。

## Decision

Jev review-route専用のthin convenience entrypointを追加する。

caller入力:
- issue-0160 source/proposal context
- approved Format Profiles
- `allowExternalJev: true`
- optional pinned model/provider id

callerが指定できない:
- Judgment question
- Jev state projector
- Choice criteria
- arbitrary Judgment provider
- prepared Judgment / Envelope

## Consent

`allowExternalJev: true` は型上必須かつruntimeでも確認する。

trueでない場合。
- snapshot readerを呼ばない
- Jev transportを呼ばない
- Authority loaderを呼ばない

これはlive transportの有無に関わらず、Jev向け外部境界を使う明示意思として扱う。

## Acceptance criteria

- [x] Jev review-route専用input型を追加する。
- [x] `allowExternalJev: true` を必須化する。
- [x] consentをsnapshot I/O前にruntime検証する。
- [x] issue-0165 provider factoryを内部生成する。
- [x] issue-0165 canonical questionを内部利用する。
- [x] callerからprovider/question/projectState/criteriaを受け取らない。
- [x] injected snapshot reader + Workbook loader版を追加する。
- [x] default readers版を追加する。
- [x] model pin/provider id overrideだけを許容する。
- [x] resultは既存 `UnifiedHumanReviewViewModelV1`。
- [x] routineでもhuman review/no-writeを維持する。
- [x] transport errorでAuthority loaderへ進まない。
- [x] live fetch/API key/retryを実装しない。
- [x] production routingを追加しない。

## Validation plan

- consent=trueでend-to-end stub transport。
- consent false castでsnapshot/transport/loaderすべて0回。
- canonical question/state/criteria使用。
- routine resultでもapplyStatus=not-authorized。
- pinned model/provider provenance。
- transport failureでloader未呼出。
- final serialization境界。
- strict compile。


## Validation evidence

### 2026-09-20 focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- consent-first / canonical-provider composition境界を
  `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true`
  でcompile成功。
- focused runtime harness: **3 tests / 3 pass / 0 fail**。
- 確認内容は次のとおりです。
  - `allowExternalJev=true` でcanonical provider/question経路へ進む。
  - consentがtrueでない場合、snapshot read / provider transport / Workbook loadをすべて0回で停止。
  - pinned model / provider idをissue-0165 -> issue-0162へ透過。
  - final Authority boundaryは `writeAuthority=none / applyStatus=not-authorized` を維持。
  - Judgmentは `proposal-only`。
- repository focused test sourceではさらに:
  - minimized Jev stateとcanonical inspect/routine criteria。
  - routine resultでもapply authorizationなし。
  - transport failureでAuthority loader未呼出。
  - final modelにJev state / raw snapshot / source path / raw Notationを保持しない。
- caller inputからprovider / question / state projectorを除外するcompile-time guardを追加。
- live fetch / API key / Authorization / retry / production configは追加していない。
- 現ローカル環境にはrepository dependency treeがないためrepository全test suite成功は主張しない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
