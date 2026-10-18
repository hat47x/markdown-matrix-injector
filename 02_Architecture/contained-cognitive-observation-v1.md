# Contained Cognitive Observation v1

## 1. 目的

CognitiveObservationのprovenance（観測の出所情報）をcaller（呼び出し側）が任意に組み立てるのではなく、contained source file（許可された範囲内の参照元ファイル）のcanonical identity（共通規則で定めた同一性情報）から生成する。

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

callerが指定する入力項目は次のとおり。

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

callerから受け取らない項目は次のとおり。

- sourceDigest

これにより、Observation provenanceのsource identity（参照元の同一性）は、issue-0152で定めたcontract（既存の契約）に従って生成される。

## 3. Stable read window

filesystem lock（読み取り中のファイル変更を防ぐロック）は行わない。

代わりに次の順序で読み取り前後の同一性を確認する。

1. contained sourceをresolve
2. identity before
3. payload reader
4. identity after

読み取り前後で、次の値を比較する。

- digest
- byteLength

いずれかが異なれば、`SourceChangedDuringCognitiveObservationError`（観測の生成中に参照元が変わったことを示すエラー）を送出する。

これは完全なtransactional snapshot（処理全体を通じて固定された状態の写し）ではないが、通常のread window（読み取りを行う区間）中のsource変更を検出し、安全側としてObservationの生成を中止する。

## 4. Payload reader

reader（payloadを読み取る処理）には、containedの検査を通過した `resolvedPath`（解決済みの参照先パス）だけを渡す。

resolver（参照先の解決）が失敗した場合やcontainment（許可範囲内であることの確認）に失敗した場合は、readerを呼ばない。

readerで発生した例外は別の結果へ変換せず、callerへそのまま伝播する。認知層が「読めなかった」状態を正常なObservationとして作り出さないためである。

## 5. Observation provenance

生成するprovenanceには次を含める。

```text
sourceKind
sourceDigest
featureVersion? 
sourceProfileId?
```

Observationのprovenanceには次を保存しない。

- absolute resolved path
- raw source bytes
- mtime
- file size（identity内byteLengthもObservationへは保存しない）

必要なsource identity metadata（参照元の同一性に関する補助情報）はbuilder result（生成処理の返却値）の別field（項目）として返せるが、CognitiveObservation自身の既存contractは変更しない。

## 6. Result

builderの返却値は次のとおり。

- observation
- resolvedPath
- sourceIdentity

resolvedPath / sourceIdentityはworkflow（処理の流れ）の内部で次処理へ渡すための結果であり、CognitiveOutcomeへ自動コピーしない。

## 7. 非責務

- Workbook parsing
- worksheet-format matching
- provider invocation
- source write
- file locking
- Authority Receipt generation
- production UI

このIssueでは、Cognitive provenanceのsource identityを生成する境界だけを固定する。
