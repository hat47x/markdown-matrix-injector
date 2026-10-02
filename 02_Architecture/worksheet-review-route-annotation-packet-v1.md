# Worksheet Review Route Annotation Packet v1

## 1. 目的

route labelerへ、判断に必要なMMI evidenceだけを渡す。

```text
Label Corpus
  |
  | strip projection/provider-adjacent state
  | strip prior labels
  v
Blinded Annotation Packet
  |
  v
independent annotation response
  |
  | packet digest revalidation
  v
new Label Corpus
```

## 2. Packet visibility

labelerが見る:
- inspect/routineの定義
- case id
- evidence source class/family/reference/facts

見ないは次のとおりです。
- projectionState
- provider choice
- probability
- confidence
- provider/model identity
- prior annotations
- adjudicated route

## 3. Route definitions

### inspect
- elevated human-review attention
- not rejection
- human review required
- apply authority none
- automatic decision none

### routine
- standard human-review attention
- not acceptance/approval
- human review required
- apply authority none
- automatic decision none

## 4. Packet digest

digestはlabeler-visible evidenceへbindする。

representation:
`worksheet-review-route-annotation-packet-v1`

algorithm:
SHA-256

case order / facts orderはcanonical sortする。
evidence fieldの内容変更はdigestを変える。

## 5. Response binding

annotation responseはpacketDigestを返す。

apply時:
1. current corpus validate
2. current packet再生成
3. digest一致
4. response validate
5. case existence / adjudication / duplicate annotator check
6. immutable update
7. resulting corpus validate

## 6. Annotation reference

annotation referenceは:

```text
annotation:<packetDigest>:<caseId>:<annotatorRef>
```

を内部生成する。

## 7. 非責務

- adjudication
- provider execution
- automatic route label
- model evaluation
- live Jev
- production routing
