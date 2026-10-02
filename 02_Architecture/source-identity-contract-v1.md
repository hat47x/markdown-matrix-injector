# Source Identity Contract v1

## 1. 目的

Cognitive Assistance PlaneとAuthority Planeが、同じsourceを同じidentity規則で参照できるようにする。

canonical source identity:

```text
representation = source-file-bytes-v1
algorithm      = sha256
digest         = sha256:<lowercase hexadecimal SHA-256>
```

## 2. Identity対象

digest対象は**resolved source fileのraw bytes**である。

対象外は次のとおりです。

- Workbookのparsed cell matrix
- worksheet feature vector
- normalized CSV text
- filesystem path文字列
- mtime

したがって同じbytesであればpathが異なってもdigestは同じ。

## 3. API

### createSourceIdentityFromBytes

既に読み込まれたbytesからidentityを生成する。

### readSourceFileIdentity

absolute pathのbytesを読みidentityを生成する。

この関数自身はcontainmentを判定しない。
「既にAuthority boundaryで許可されたabsolute path」に対するprimitiveである。

### resolveContainedSourceIdentity

既存 `resolveSourcePath` を用いて:

1. markdown-relative/workspace-root resolution
2. workspace containment
3. symlink realpath containment
4. source bytes identity

を順に実行する。

返却は次のとおりです。

- resolvedPath
- identity

## 4. byteLength

identityには `byteLength` を保持する。

byteLengthはdigestの代用ではなく、diagnostic / consistency check用の補助metadataである。

## 5. Authority adapter

Authority adapterは既にresolver/containment failureを個別checkへ写像する必要があるため、
`resolveContainedSourceIdentity` を直接置換利用せず:

- 既存resolveContextでcontained path取得
- `readSourceFileIdentity` でdigest取得

とする。

これによりReceipt evidence codeを変更せず、hash規則だけ共通化できる。

## 6. Cognitive側への利用

本IssueではCognitive Observation builderまでは実装しない。

次段階では次のとおりです。

```text
resolveContainedSourceIdentity
  -> CognitiveObservation.provenance.sourceDigest
```

と接続するための共通primitiveを先に完成させる。

## 7. 非責務

- file locking
- transactional snapshot
- Workbook parsing
- Cognitive Observation生成
- source write
- mtimeによるidentity
- semantic content hashing

source identityの意味を一義化することだけを責務とする。
