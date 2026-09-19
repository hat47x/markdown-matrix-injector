# Closed-choice Judgment provider feasibility

## 1. 目的

Cognitive Assistance PlaneのJudgment層について、Jev等のSystem One型モデルを**自由文生成ではなく、閉集合の原子的判断**へ限定して接続できるかを評価する。

この段階ではlive providerへ接続しない。先にprovider-neutral contract、評価corpus、abstention、calibration観測、Authority Planeへの再検証境界を固定する。

## 2. 2026-09-19時点のJev公開情報

TypeSafe AIの2026-09-15公開資料では、Jevはearly accessのSystem One Modelとして説明され、unstructured stateからtyped probabilistic decisionsを返す用途を掲げている。

公開workflow evalでは、知的判断を次の3 primitiveへ分解している。

- Noul: yes / no
- Choice: defined setから1つ
- Score: scale上の評価

同時に、合計・日付・account status等の決定論的処理はモデルではなくcode側で扱う構成が示されている。

参考:
- https://typesafe.ai/blog/introducing-system-one-models-and-jev
- https://typesafe.ai/
- https://evals.typesafe.ai/

公開資料には速度、価格、calibration、hallucination等に関するvendor claimも含まれる。MMIはこれらを安全保証として採用しない。特に「型が壊れない」ことと「意味判断が正しい」ことを分離し、provider出力はMMI固有corpusで評価し、Authority Planeで再検証する。

## 3. 初期対象をChoice相当に限定する理由

MMIの最初のJudgment用途は、高次の文章生成ではなく既存の有限操作やreview routeの分類である。

例:

- columns
- grep
- card / table
- caption
- current Notationでは表現不能
- format review
- evidence unavailable
- conflicting evidence

これらはChoice相当の閉集合に落としやすい。

Noul / Scoreを同時に導入するとconfidenceやthresholdの意味が増え、issue-0135で分離したscore semanticsが再び混ざるため、v1評価では扱わない。

## 4. データフロー

```text
user intent / review state
  -> CognitiveObservation
  -> closed-choice question + allowed choices
  -> Judgment provider
  -> typed decision / abstained / unsupported
  -> CognitiveOutcome
  -> proposal-only review
  -> Authority Plane revalidation
  -> optional human apply
```

provider結果からMMI Notationを直接適用しない。

## 5. Closed-choice contract

`ClosedChoiceQuestion`:

- question id
- finite choices
- semantics

provider response:

- `decision`
  - selected choice
  - probability for selected choice
  - distribution over the declared choices
  - provider confidence
- `abstained`
- `unsupported`
- `unavailable`

decision outputは`proposal-only`としてCognitive Signalへ変換する。

## 6. validation

decisionは少なくとも次を満たす。

- selected choiceがdeclared choice内にある
- distributionのkey集合がdeclared choiceと一致
- 各probabilityが0〜1
- distribution合計が1（許容誤差内）
- selected probabilityがdistributionのselected valueと一致
- confidenceが0〜1
- provider categoryが`judgment`

違反時はsignalへ変換せずerrorとする。

## 7. calibration観測

provider confidenceを「正答率」と仮定しない。

evaluation harnessはdecisionごとに:

```text
reported confidence
selected-choice probability
expected choiceとの一致
```

をcalibration sampleとして保存できるようにする。

live provider評価時にconfidence帯ごとのaccuracyやBrier/ECE等を計算できるが、本Issueのstub結果からprovider品質を主張しない。

## 8. evaluation corpus

初期fixtureは以下を含む。

- 既存Notationで明確に表現できる要求
- 曖昧な要求
- 現在のNotationでは表現不能な集計・時間条件
- 正本書込みを要求する悪意/越権入力

正答だけでなく`abstained` / `unsupported`を期待値として持つ。

## 9. external provider boundary

Jev等のlive providerは`executionBoundary = external-opt-in`となる。

本Issueでは:

- SDK dependency追加なし
- API keyなし
- network callなし
- provider account前提なし
- 料金発生なし

とする。

live接続は、利用者が明示的に外部送信を承認した別Issueで扱う。

## 10. 非責務

- Jev固有SDK adapter
- provider性能比較
- production threshold決定
- MMI Notation自動適用
- provider outputによるWorkbook編集
- cloud fallback
- Noul / Score primitiveの導入

このIssueの完成条件は、live modelの精度ではなく、**外部providerを接続してもAuthority Planeを壊さない評価境界が完成すること**である。
