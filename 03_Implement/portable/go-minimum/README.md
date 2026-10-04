# Standard Go minimum portable Core

issue-0203の比較用実装。production採用を決めるものではない。

## 範囲

- `mmi.portable-core-request/v1` / response v1を使用する。
- 標準ライブラリだけでbuildする。
- UTF-8 CSVのdeterministic table Candidateと、UTF-8 JSONの明示Tree Candidateを実装する。
- XLSX、XML、CP932、provider-dependent処理は未対応である。
- CSVの空行/空列分割、title/header判定、Candidate claim、provenance、fingerprint、referenceはTypeScript参照実装のCSV経路を移植する。

## 実行

```sh
go test ./...
go build -trimpath -ldflags="-s -w" -o mmi-portable-go-minimum .
./mmi-portable-go-minimum ../../test/fixtures/portable-core-v1/csv-table.case.json
./mmi-portable-go-minimum ../../test/fixtures/portable-core-v1/json-tree.case.json
```

この実装をCore採用候補とみなす条件は、現在のfixtureを通すことだけではない。TypeScript側でbaseline responseを固定し、追加corpusでもCandidate semanticsが一致すること、XLSX経路、native/WASMのsize/startup/memory比較を満たす必要がある。

## 2026-10-04 実測

`go1.23.2 linux/amd64`でshared CSV conformance caseを実行し、source digest、Candidate位置・provenance・fingerprint・referenceまで一致した。実装上は同じportable request/response契約へJSON Treeも追加し、object keyのUTF-16順、JSON Pointer、Claim、provenance、subtree fingerprintをTypeScript参照実装と同じshared fixtureで固定する。ASCIIだけで偶然一致しないよう、`/`・`~`を含むkeyとUnicode keyの順序を別fixtureでも固定する。CSV parserにはTypeScript参照実装と同じBOM、CRLF、quoted comma、escaped quote、quoted newline、trim、unterminated quoteの回帰を追加した。さらに`maxScanCells`を`int64`で保持し、native / wasm32のどちらでもJavaScript safe integer上限（9,007,199,254,740,991）まで同じ受理規則になるようにした。修正版のGo test suiteはnativeと標準Go WASMの両方で全件通過した。

stripした標準Go native binaryは1,953,944 bytes、Windows amd64 cross-buildは2,084,864 bytes、標準Go WASMは3,336,196 bytesだった。同じCSV requestに対しnativeとWASMのJSON出力はbyte-for-byteで一致した。

このLinux containerでのprocess実行は、native 100回の中央値が約1.00 ms、peak RSS 30回の中央値が約2.4 MiBだった。標準Go WASMをNode `wasm_exec_node.js`で起動した場合、30回の中央値は約72.11 ms、peak RSS 10回の中央値は約51.8 MiBだった。これはbrowser/WASMや長寿命hostの性能を表す値ではなく、短命processとしての初期比較である。

TinyGoはこの環境に無いため未測定。標準Go native/WASMの結果だけでtoolchainを選定しない。

機械可読な詳細は [evidence/2026-10-04-standard-go-csv.json](evidence/2026-10-04-standard-go-csv.json) を参照する。
