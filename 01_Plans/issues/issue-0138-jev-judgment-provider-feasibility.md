# Issue: Jev等のclosed-choice Judgment provider feasibilityを評価する

## Meta
- Type: Evaluation / Feature design
- Status: Done
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
- [x] closed-choice input/output schemaをCognitive Contract上で表現する。
- [x] 自然言語から直接MMI記法を自動適用しない。
- [x] provider結果は既存parser/schema/resolverで再検証する前提を固定する。
- [x] `unsupported` / `abstained`を第一級結果として評価する。
- [x] 正常・曖昧・表現不能・悪意ある入力を含むcorpusを定義する。
- [x] accuracyだけでなく誤った自動採用0件、abstention挙動、calibration観測方法を定義する。
- [x] live network / provider SDKなしで評価harnessを実行可能にする。
- [x] live Jev接続を本Issueで自動実施しない。
- [x] MMI Notation conformance要件へprovider依存を追加しない。

### Validation plan

stub providerでclosed-choice contract、abstention、invalid choice、confidence namespace、provenanceを検証する。live provider評価は別gateとする。


## Public research evidence (2026-09-19)

TypeSafe AIの公開情報を再確認し、設計上は次だけを採用した。

- Jevは2026-09-15公開時点でearly accessのSystem One Modelとして案内されている。
- provider interfaceはstructured questionsからtyped decisions、probabilities / confidenceを返す用途を掲げている。
- 公開workflow evalはNoul / Choice / Scoreへ判断を分解し、算術・日付・status等の決定論的処理をcode側へ残している。
- launch postではChoiceのcardinality上限として255が記載されている。

参考は次のとおりです。
- https://typesafe.ai/blog/introducing-system-one-models-and-jev
- https://typesafe.ai/
- https://evals.typesafe.ai/

速度・価格・calibration・hallucination等のvendor claimはMMIの安全保証として採用しない。今回のMMI契約はprovider出力をproposal-onlyとし、意味的正しさをAuthority Planeの再検証とMMI固有corpusから独立に評価する。

## Validation evidence

### 2026-09-19 local focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- strict compile: `--strict --target ES2022 --module NodeNext --moduleResolution NodeNext` で成功。
- focused unit test: **6 tests / 6 pass / 0 fail**。
- evaluation corpus JSON: parse成功、**8 cases**。
  - expected Choice: 4
  - expected abstained: 1
  - expected unsupported: 3
- 検証内容は次のとおりです。
  - declared Choice内のdecisionだけをsignal化。
  - decisionは常に `proposal-only`。
  - selected probability / provider confidenceをprovider namespaceで分離保持。
  - `abstained / unsupported / unavailable`をnon-decisionとして保持。
  - undeclared choice、distribution key不一致、sum不正をfail-closed。
  - Judgment category / `closed-choice` capabilityを必須化。
  - provider confidenceを正答とみなさず、`confidence / choiceProbability / correct`のcalibration sampleを収集可能。
  - abstentionはcalibration decision sampleへ混入させない。
- live Jev SDK、network call、API key、provider account、課金経路は追加していない。
- MMI Notation候補の自動適用、Workbook変更、production runtime接続は追加していない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
