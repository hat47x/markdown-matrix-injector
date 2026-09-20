# Worksheet Review Route Label Corpus v1

## 1. 目的

Jev等のproviderを評価する前に、inspect/routineの期待ラベルをprovider出力から独立して固定する。

## 2. Blinding

corpusは次をlabelerへ見せない前提で作る。

- provider choice
- provider identity
- model identity
- probability distribution
- provider confidence

schemaにもこれらの保存欄を設けない。

## 3. Evidence

labelerが見るのはMMI側で独立生成されたreview facts。

case evidence:
- sourceClass
- caseFamily
- reference
- facts

`facts` は事実記述であり、providerの提案routeを含めない。

optional `projectionState` はissue-0165でproviderへ送る4項目stateそのもの。
これはprovider出力ではないためcorpusへ保持可能。

## 4. Annotation lifecycle

### pending

annotations = []
adjudicationなし。

### annotated

1件以上のindependent annotation。
まだ最終evaluation labelではない。

### adjudicated

1件以上のannotation + adjudication。

issue-0167へexpected routeとして渡せるのはadjudicated caseだけ。

## 5. Why not reuse expectedReview

既存worksheet testsの `expectedReview` は:
- boundary warning
- fill telemetry
- drift signal

等の個別検出器を評価するためのラベル。

inspect/routineはhuman-review attention routeであり意味が異なる。
同名の「review」を理由に変換しない。

## 6. Exact schema

unknown fieldsは拒否する。
これにより後から便利だからという理由で:
- providerChoice
- confidence
- model
- score

等がlabel corpusへ混入することを防ぐ。

## 7. Adjudication

adjudicationは最終expected routeを決めるが、runtime Authority verdictではない。

inspect/routineはいずれもissue-0165の通り:
- human review required
- apply authority none
- automatic decision none

## 8. Seed corpus

seedは既存scenario familyの参照だけを収録し、routeは未ラベル。

seed自体からprovider性能やstate sufficiencyを主張しない。

## 9. 非責務

- provider run
- live Jev
- route threshold
- automatic label generation
- production fallback
- apply authority
