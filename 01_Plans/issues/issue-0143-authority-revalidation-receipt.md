# Issue: Authority revalidation receipt境界を実装する

## Meta
- Type: Feature / Trust-boundary contract
- Status: Done
- Priority: High
- Scope: Authority revalidation receipt, source binding, applicability rules, review-envelope validation, focused tests
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: requirements.md Phase 13
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md, issue-0141-cognitive-review-envelope.md, issue-0142-cognitive-review-presentation.md
- Depends on: issue-0141 Done, issue-0142 Done
- Parallel exclusion: fill telemetry / external-XLSX files、production parser/resolver/UIには触れない

## Execution Plan

### Proposed solution

Cognitive Review Envelope内のAuthority requirementsは引き続き `pending` のままとし、完了情報は別の `AuthorityRevalidationReceiptV1` として表現する。

ReceiptはAuthority Plane由来のdeterministic check結果を束ねる契約であり、Cognitive moduleがEnvelopeのpending stateを書き換えるAPIは提供しない。

Receiptは:

- source digest
- Authority issuer component/version/run id
- scope: `review-evidence` / `executable-proposal`
- Envelopeで要求されたcheckごとの `passed / failed / not-applicable`
- stable evidence code

を持つ。

適用規則は次のとおりです。

- `always` requirementsは `passed / failed` のみ。not-applicable不可。
- `executable-proposal` requirements:
  - scope=`review-evidence` では `not-applicable`
  - scope=`executable-proposal` では `passed / failed`
- requirement集合はEnvelopeと完全一致し、欠落・余剰・重複を許さない。
- source digest不一致をfail-closedする。
- `failed` が1件でもあればbinding statusは `blocked`。
- 全required checkがpass（または正しくnot-applicable）なら `satisfied`。
- ReceiptはEnvelope/Presentationをmutateしない。

### Acceptance criteria

- [x] `AuthorityRevalidationReceiptV1` をpure TypeScriptで定義する。
- [x] issuerは `kind=authority-plane`、component id/version/run idを持つ。
- [x] source digestでCognitive Review Envelopeへbindingする。
- [x] EnvelopeのAuthority requirement集合とReceipt check集合を完全一致させる。
- [x] always checkのnot-applicableを拒否する。
- [x] review-evidence scopeではexecutable-proposal checksをnot-applicableに限定する。
- [x] executable-proposal scopeではconditional checksのnot-applicableを拒否する。
- [x] failed checkがあればbindingを `blocked` とする。
- [x] 全checkがscope規則を満たしfailureがなければ `satisfied` とする。
- [x] evidence codeを各checkに必須化し、空値を拒否する。
- [x] duplicate / missing / extra checkを拒否する。
- [x] Envelope / Presentationを更新・書換えするAPIを作らない。
- [x] runtimeの真正なAuthority issuerであることをTypeScript型だけでは証明できない制約をarchitecture文書へ明記する。
- [x] production parser/resolver/containment/UIへ接続しない。
- [x] focused testでreview-evidence satisfied/blocked、executable-proposal satisfied/blocked、digest mismatch、applicability違反、集合不一致を確認する。

### Validation plan

- strict TypeScript compile。
- issue-0141のEnvelopeを実際に生成してReceipt bindingをfocused testする。
- binding前後でEnvelopeのAuthority requirementsが全てpendingのまま不変であることを確認する。
- repository差分でfill telemetry / external-XLSX / production runtime/UIに変更がないことを確認する。
- GitHub Actionsの既知runner/resource不足は完了条件にしない。


## Validation evidence

### 2026-09-19 local focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- strict compile: `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true` で成功。
- focused integration test: **8 tests / 8 pass / 0 fail**。
- issue-0141の実際のEnvelope生成経路（approved Format Profile → matcher → Perception → review envelope）にReceiptをbindingして検証。
- 確認内容は次のとおりです。
  - review-evidence scopeでalways checks通過、executable-proposal checksをnot-applicableとして `satisfied`。
  - always check failureで `blocked`。
  - executable-proposal scopeで全conditional check評価時に `satisfied`。
  - containment等のfailureで `blocked`。
  - review-evidenceでconditional checkをpassed/failedにする誤用を拒否。
  - executable-proposalでconditional checkをnot-applicableにする誤用を拒否。
  - always checkのnot-applicableを拒否。
  - source digest不一致を拒否。
  - duplicate / missing / extra checkを拒否。
  - 空evidence code / 空issuer metadataを拒否。
  - Receipt順序に依存せず、binding resultをEnvelope requirement順へcanonicalize。
  - binding前後でEnvelopeのAuthority requirementsが**全件pendingのまま不変**。
- Receiptは構造整合性契約であり、TypeScript型だけでAuthority発行主体の真正性を証明しない制約をarchitecture文書へ明記。
- production parser/resolver/containment/UI、fill telemetry、external XLSX fixtureは変更していない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
