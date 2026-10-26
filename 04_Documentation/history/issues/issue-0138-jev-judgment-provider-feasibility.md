# Issue: Jevなどの選択肢限定型Judgment providerの実現可能性を評価する

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

本Issueは、認知支援用のJudgment provider（候補から判断を返す部品）を導入できるかを調べた、当時の実験記録である。**closed-choice**はあらかじめ宣言した選択肢の中から答えを返す方式、**stub provider**は外部サービスを呼ばずに所定の応答を返す試験用実装を指す。候補の適合性を調べることと、実際のproviderを採用することは別の判断であり、live Jevの採用や外部送信をこの記録から確定させない。

## Execution Plan
### Proposed solution

JevなどのSystem One型モデルについて、自由文を生成する用途ではなく、**あらかじめ定めた選択肢から個別に判断する用途**での適合性を評価する。

初期対象は、MMI入力意図（列選択 / grep / card-table / caption / 現行Notationでは表現不能）と、review route（format candidate review / evidence unavailable / conflicting evidence / unsupported-abstain）の分類とする。

まず、provider SDKやlive networkを接続せず、Cognitive Contractに沿ったadapterの入出力形式、fixture（試験用の固定データ）、stub providerで評価方法を定める。live providerへの接続、外部送信、API keyの使用、費用が発生する検証は本Issueの完了条件に含めず、別途明示的な承認を得てから実施する。

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

stub providerを用い、closed-choice contract、abstention（判断保留）、invalid choice（選択肢外の応答）、confidence namespace（スコアの提供元と意味を区別する名前空間）、provenance（出典情報）を検証する。live providerの評価には別の承認段階を設ける。


## Public research evidence (2026-09-19)

TypeSafe AIの公開情報を再確認し、設計の参考として次の事項だけを採り入れた。

- Jevは2026-09-15公開時点でearly accessのSystem One Modelとして案内されている。
- provider interfaceはstructured questionsからtyped decisions、probabilities / confidenceを返す用途を掲げている。
- 公開workflow evalはNoul / Choice / Scoreへ判断を分解し、算術・日付・status等の決定論的処理をcode側へ残している。
- launch postではChoiceのcardinality上限として255が記載されている。

参照した公開情報は次のとおり。
- https://typesafe.ai/blog/introducing-system-one-models-and-jev
- https://typesafe.ai/
- https://evals.typesafe.ai/

速度・価格・calibration（確信度と正答率の対応）・hallucination（根拠のない出力）などに関する提供元の主張を、MMIの安全保証には採用しない。今回の契約ではprovider出力を `proposal-only`（採用前の提案）として扱う。意味的な正しさは、Authority Planeでの再検証とMMI固有の評価corpusを通じて、providerの主張とは独立に評価する。

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
- 検証した項目は次のとおり。
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
