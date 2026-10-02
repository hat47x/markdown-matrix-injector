# Contained Cognitive Observation v1

## 1. 目的

CognitiveObservationのprovenanceを、callerが任意に組み立てるのではなく、contained source fileのcanonical identityから生成する。

```text
Markdown/workspace context
        |
        v
resolveSourcePath
        |
        v
source-file-bytes-v1 identity (before)
        |
        v
source-derived payload reader
        |
        v
source-file-bytes-v1 identity (after)
        |
        +-- changed -> fail closed
        |
        v
CognitiveObservation
```

## 2. Input boundary

callerが指定するもの。

- observation id
- kind
- schemaVersion
- sourceKind
- markdownFilePath
- sourcePath
- optional workspaceRoot
- optional featureVersion
- optional sourceProfileId
- payload reader callback

callerが指定しないもの。

- sourceDigest

これにより、Observation provenanceのsource identityはissue-0152のcontractへ固定される。

## 3. Stable read window

filesystem lockは行わない。

代わりには次のとおりです。

1. contained sourceをresolve
2. identity before
3. payload reader
4. identity after

を行う。

before / afterで:

- digest
- byteLength

のどちらかが異なれば `SourceChangedDuringCognitiveObservationError` とする。

これは完全なtransactional snapshotではないが、通常のread window中のsource変更を検出し、安全側へ倒す。

## 4. Payload reader

readerにはcontained `resolvedPath` だけを渡す。

resolver失敗・containment failure時はreaderを呼ばない。

readerの例外は変換せずcallerへ伝播する。
認知層が「読めなかった」を正常なObservationとして捏造しないためである。

## 5. Observation provenance

生成するprovenance:

```text
sourceKind
sourceDigest
featureVersion? 
sourceProfileId?
```

保存しないは次のとおりです。

- absolute resolved path
- raw source bytes
- mtime
- file size（identity内byteLengthもObservationへは保存しない）

必要なsource identity metadataはbuilder resultの別fieldとして返せるが、CognitiveObservation自身は既存contractを変更しない。

## 6. Result

返却値は次のとおりです。

- observation
- resolvedPath
- sourceIdentity

resolvedPath / sourceIdentityはworkflow内部で次処理へ渡すための結果であり、CognitiveOutcomeへ自動コピーしない。

## 7. 非責務

- Workbook parsing
- worksheet-format matching
- provider invocation
- source write
- file locking
- Authority Receipt generation
- production UI

このIssueはCognitive provenanceのsource identity生成境界だけを固定する。
