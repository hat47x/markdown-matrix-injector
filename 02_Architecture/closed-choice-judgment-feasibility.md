# Closed-choice Judgment provider feasibility

## 1. 目的

Cognitive Assistance Plane（認知的な支援を担う処理層）のJudgment層（判断を扱う部分）について、Jev等のSystem One型モデル（即時的な判断を扱うモデル）を**自由文生成ではなく、閉集合の原子的判断**へ限定して接続できるかを評価する。ここでいう閉集合とは、あらかじめ定めた選択肢だけから選ぶ方式を指す。

この段階ではlive provider（実際に応答を返す外部モデルの提供元）へは接続しない。先にprovider-neutral contract（特定の提供元に依存しない契約）、評価corpus（評価用の事例集）、abstention（判断を保留すること）、calibration観測（モデルが示す確信度と実際の正しさの関係の観測）、Authority Plane（既存規則による検証を担う処理層）への再検証境界を固定する。

## 2. 2026-09-19時点のJev公開情報

TypeSafe AIの2026-09-15公開資料では、Jevはearly access（早期提供段階）のSystem One Modelとして説明され、unstructured state（定型化されていない状態情報）からtyped probabilistic decisions（型が定まった確率的判断）を返す用途を掲げている。

公開workflow eval（業務の流れに沿った評価）では、知的判断を次の3 primitive（基本的な判断形式）に分解している。

- Noul: yes / no
- Choice: defined setから1つ
- Score: scale上の評価

一方、合計・日付・account status等の決定論的処理（同じ入力なら同じ結果となる処理）は、モデルではなくcode側で扱う構成が示されている。

参考は次のとおりです。
- https://typesafe.ai/blog/introducing-system-one-models-and-jev
- https://typesafe.ai/
- https://evals.typesafe.ai/

公開資料には速度、価格、calibration、hallucination（事実に基づかない出力）等に関するvendor claim（提供企業による主張）も含まれる。MMIは、これらを安全保証として採用しない。特に「型が壊れない」ことと「意味判断が正しい」ことを分け、provider出力はMMI固有corpusで評価し、Authority Planeで再検証する。

## 3. 初期対象をChoice相当に限定する理由

MMIで最初に想定するJudgmentの用途は、複雑な文章生成ではなく、既存の有限操作やreview route（レビューの進め方）の分類である。

例は次のとおりです。

- columns
- grep
- card / table
- caption
- current Notationでは表現不能
- format review
- evidence unavailable
- conflicting evidence

これらは、Choice（定められた選択肢から1つ選ぶ判断）に相当する閉集合で表しやすい。

Noul / Scoreを同時に導入すると、confidence（確信度）やthreshold（判定の閾値）の意味が増え、issue-0135で分離したscore semantics（評価値の意味）が再び混ざるため、v1評価では扱わない。

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

provider（判断結果を返す側）の結果から、MMI Notation（MMIの参照記法）を直接適用しない。

## 5. Closed-choice contract

`ClosedChoiceQuestion`（閉集合からの選択を求める質問）の構成は次のとおりである。

- question id
- finite choices
- semantics

provider response（提供元からの応答）は次のとおりである。

- `decision`
  - selected choice
  - probability for selected choice
  - distribution over the declared choices
  - provider confidence
- `abstained`
- `unsupported`
- `unavailable`

decision output（判断結果）は、`proposal-only`（提案としてのみ扱う状態）としてCognitive Signal（認知側からの判断情報）へ変換する。

## 6. validation

decision（選択結果）は、少なくとも次の条件を満たす。

- selected choiceがdeclared choice内にある
- distributionのkey集合がdeclared choiceと一致
- 各probabilityが0〜1
- distribution合計が1（許容誤差内）
- selected probabilityがdistributionのselected valueと一致
- confidenceが0〜1
- provider categoryが`judgment`

条件に違反した場合はsignalへ変換せず、errorとする。

## 7. calibration観測

provider confidence（提供元が示す確信度）を、そのまま「正答率」とは仮定しない。

evaluation harness（評価を実行する仕組み）は、decisionごとに次の情報を扱う。

```text
reported confidence
selected-choice probability
expected choiceとの一致
```

これらをcalibration sample（確信度と正答の対応を調べるための記録）として保存できるようにする。

live providerを評価する際には、confidence帯ごとのaccuracy（正確さ）やBrier/ECE（確率予測の良さを測る指標）等を計算できる。ただし、本Issueのstub結果（実際のproviderを使わない代替処理の結果）からprovider品質を主張しない。

## 8. evaluation corpus

初期fixture（評価に使う入力事例）は、次のものを含む。

- 既存Notationで明確に表現できる要求
- 曖昧な要求
- 現在のNotationでは表現不能な集計・時間条件
- 正本書込みを要求する悪意/越権入力

正答だけでなく`abstained` / `unsupported`を期待値として持つ。

## 9. external provider boundary

Jev等のlive providerを使う場合、`executionBoundary = external-opt-in`（利用者が明示的に外部接続を選ぶ境界）となる。

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

このIssueの完成条件は、live modelの精度を示すことではない。**外部providerを接続してもAuthority Planeを壊さない評価境界が完成すること**を条件とする。
