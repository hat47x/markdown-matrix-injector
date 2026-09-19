# Issue: Jev等のclosed-choice Judgment provider feasibilityを評価する

## Meta
- Type: Evaluation / Feature design
- Status: Draft
- Priority: Medium
- Scope: provider-neutral closed-choice adapter contract, intent/review corpus, offline stub evaluation
- Expected verification level: unit + evaluation

## Traceability
- Related Backlog/Phase: requirements.md Phase 13
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md, ADR-0016-notation-first-input-assistance.md
- Depends on: issue-0135 Done

## Execution Plan
### Proposed solution

Jev等のSystem One型モデルを、自由文生成ではなく**閉集合の原子的判断**へ限定して評価する。

初期対象は、MMI入力意図（列選択 / grep / card-table / caption / 現行Notationでは表現不能）と、review route（format candidate review / evidence unavailable / conflicting evidence / unsupported-abstain）の分類とする。

最初はprovider SDKやlive networkを接続せず、Cognitive Contractに従うadapter shape、fixture、stub providerで評価系を固定する。live provider接続、外部送信、API key、費用発生を伴う検証は本Issueの完了条件に含めず、別途明示承認後に行う。

### Acceptance criteria
- [ ] closed-choice input/output schemaをCognitive Contract上で表現する。
- [ ] 自然言語から直接MMI記法を自動適用しない。
- [ ] provider結果は既存parser/schema/resolverで再検証する前提を固定する。
- [ ] `unsupported` / `abstained`を第一級結果として評価する。
- [ ] 正常・曖昧・表現不能・悪意ある入力を含むcorpusを定義する。
- [ ] accuracyだけでなく誤った自動採用0件、abstention挙動、calibration観測方法を定義する。
- [ ] live network / provider SDKなしで評価harnessを実行可能にする。
- [ ] live Jev接続を本Issueで自動実施しない。
- [ ] MMI Notation conformance要件へprovider依存を追加しない。

### Validation plan

stub providerでclosed-choice contract、abstention、invalid choice、confidence namespace、provenanceを検証する。live provider評価は別gateとする。
