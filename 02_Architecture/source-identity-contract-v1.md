# Source Identity Contract v1

## 1. 目的

Cognitive Assistance Plane（認知支援側）とAuthority Plane（規約を決定論的に検証する側）が、同じsource（参照元ファイル）について共通のidentity（同一性）規則を使えるようにする。

正規のsource identity（原本の同一性を表す形式）は次のとおり。

```text
representation = source-file-bytes-v1
algorithm      = sha256
digest         = sha256:<lowercase hexadecimal SHA-256>
```

## 2. Identity対象

digest（内容を照合するための値）の対象は、**resolved source file（参照先を解決した原本ファイル）のraw bytes（加工前のバイト列）**である。

次の情報はdigestの計算対象としない。

- Workbookのparsed cell matrix
- worksheet feature vector
- normalized CSV text
- filesystem path文字列
- mtime

したがって、ファイルのpath（所在）が異なっていても、bytesが同じならdigestは同じになる。

## 3. API

### createSourceIdentityFromBytes

すでに読み込んだbytes（バイト列）からidentityを生成する。

### readSourceFileIdentity

absolute path（絶対パス）で指定されたファイルのbytesを読み取り、identityを生成する。

この関数自身はcontainment（許可された領域内に参照先が収まること）を判定しない。
Authority boundary（Authority側で参照を許可する境界）で、すでに許可されたabsolute pathを扱うprimitive（基本処理）である。

### resolveContainedSourceIdentity

既存の`resolveSourcePath`を用い、次の処理を順に行う。

1. markdown-relative/workspace-root resolution
2. workspace containment
3. symlink realpath containment
4. source bytes identity

を順に実行する。

返す情報は次のとおり。

- resolvedPath
- identity

## 4. byteLength

identityには、原本のバイト数を表す`byteLength`を保持する。

byteLengthはdigestの代わりにはならず、diagnostic（診断）やconsistency check（整合性確認）のための補助metadata（付随情報）である。

## 5. Authority adapter

Authority adapter（Authority側の処理へつなぐ部品）は、resolver/containment failure（参照先の解決や領域内判定の失敗）を個別のcheckへ対応づける必要がある。このため、
`resolveContainedSourceIdentity` を直接置換利用せず:

- 既存resolveContextでcontained path取得
- `readSourceFileIdentity` でdigest取得

とする。

これにより、Receipt evidence code（検証結果に付ける証拠コード）を変更せずに、hash（バイト列からdigestを求める処理）の規則だけを共通化できる。

## 6. Cognitive側への利用

本Issueの実装範囲には、Cognitive Observation builder（認知側の観測記録を組み立てる処理）を含めない。

次段階での接続先は次のとおり。

```text
resolveContainedSourceIdentity
  -> CognitiveObservation.provenance.sourceDigest
```

この接続に先立ち、共通primitiveを用意する。

## 7. 非責務

- file locking
- transactional snapshot
- Workbook parsing
- Cognitive Observation生成
- source write
- mtimeによるidentity
- semantic content hashing

この契約が担うのはsource identityの意味を一つに定めることであり、ファイルの固定や取引的一貫性の保証は非責務として残す。
