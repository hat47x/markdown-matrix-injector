# Issue: Executable ProposalをAuthority Evidenceへ暗号学的に束縛する

## Meta
- Type: Feature / Integrity boundary
- Status: Done
- Priority: High
- Scope: proposal identity, Authority adapter evidence wrapper, replay/swap prevention, focused tests
- Expected verification level: unit + focused integration

## Traceability
- Related Backlog/Phase: requirements.md Phase 13
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md, issue-0143-authority-revalidation-receipt.md, issue-0145-authority-revalidation-adapter.md
- Depends on: issue-0145 Done
- Parallel exclusion: fill telemetry / external-XLSX / production plugin・extension配線は変更しない

## Problem

`AuthorityRevalidationReceiptV1` はsource digestへ結び付いているが、同じsourceに対する複数のNotation proposalを区別するproposal identityを持たない。

そのため、Receipt単体だけを後段へ渡す設計では「proposal Aを検証したReceipt」を同じsourceの「proposal B」へ誤って関連付ける余地がある。

## Execution Plan

### Proposed solution

issue-0145 adapterを**同じrawNotation入力で実行した瞬間**にproposal identityを生成し、Receiptと一体の `ExecutableProposalAuthorityEvidenceV1` として返す。

proposal identity:

- algorithm: SHA-256
- representation: `mmi-notation-trimmed-utf8-v1`
- digest: `sha256:<lowercase hex>`
- leading/trailing whitespaceはparserと同様にidentityから除外
- 内部文字列・query parameter順序等はそのままidentityへ反映
- raw NotationそのものはEvidenceへ保存しない

後段では `bindExecutableProposalAuthorityEvidence` が:

1. Evidence schema / source identity / receipt scopeを検証
2. 現在review中のrawNotationを同じ規則でhash
3. proposal digest一致を要求
4. issue-0143のReceipt binderを実行
5. `satisfied / blocked` をproposal identity付きで返す

### Acceptance criteria

- [x] `ExecutableProposalAuthorityEvidenceV1` をpure TypeScriptで定義する。
- [x] Evidence生成はissue-0145 adapterを内部で呼び、同じrawNotationからproposal digestを生成する。
- [x] proposal representationを `mmi-notation-trimmed-utf8-v1` に固定する。
- [x] raw Notation本文をEvidenceへ保持しない。
- [x] 同一Notationはdeterministicに同じdigestを生成する。
- [x] leading/trailing whitespace差は同一identityとする。
- [x] query/value等の内部差は異なるidentityとする。
- [x] `bindExecutableProposalAuthorityEvidence` は現在のrawNotationとEvidence digest不一致をfail-closedする。
- [x] Evidence source digest / embedded Receipt source digest / Envelope source digestをすべて一致させる。
- [x] embedded Receiptは `scope=executable-proposal` 必須。
- [x] Authority statusがblockedでもEvidence自体は保持可能とし、proposal identityを失わない。
- [x] issue-0143 binderを再利用し、Receipt check semanticsを複製しない。
- [x] Evidence wrapperはReceipt issuerの真正性を新たに保証したとは扱わない。
- [x] production runtime / plugin / extension / matcher / fill telemetryを変更しない。

### Validation plan

- real temporary CSV + WorkbookData + issue-0145 adapter経路でEvidenceを生成する。
- satisfied proposalのbinding成功。
- 同一source上で別NotationへReceipt/Evidenceを流用するswapを拒否。
- leading/trailing whitespace差を許容。
- invalid known parameterによるblocked Authority statusでもproposal identityを保持。
- schema/source/scope改変をfail-closed。
- serialized Evidenceにraw Notationが含まれないことを確認。
- GitHub Actionsの既知runner/resource不足は完了条件にしない。


## Validation evidence

### 2026-09-19 local focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- issue-0145 adapter + Evidence moduleのstrict compile: `target ES2022 / module NodeNext / moduleResolution NodeNext / strict=true` で成功。
- focused runtime harness: **9 checks / 9 pass / 0 fail**。
- 検証内容:
  - satisfied Authority Receiptをexact proposal identityへbinding。
  - 同一source上でtable proposal用Evidenceをcard proposalへ流用するswapをproposal digest mismatchで拒否。
  - leading/trailing whitespace差は同一identity。
  -内部Notation変更は異なるidentity。
  - invalid known parameterによるblocked Receiptでもproposal identityを保持し、binding自体はblockedとして成立。
  - Evidence source digest改変を拒否。
  - embedded Receipt source digest改変を拒否。
  - `review-evidence` scope Receiptへの改変を拒否。
  - Evidence schema改変を拒否。
  - serialized Evidenceはproposal digestを保持する一方、raw Notation / `mode=table` / source filepathを保持しない。
  - repeated identity creationはdeterministic。
- Evidence generationは任意Receiptを後付けするconstructorではなく、issue-0145 adapterと同一rawNotationを同時に用いるAPIに限定。
- integrity bindingであり、Receipt issuer authenticityを新たに保証したとは扱わない。
- production runtime / plugin / extension / matcher / fill telemetry / external-XLSX評価コードは変更していない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
