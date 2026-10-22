# Standard Go minimum portable Core

issue-0203の比較用実装。production採用を決めるものではない。

## 範囲

- `mmi.portable-core-request/v1` / response v1を使用する。
- 標準ライブラリだけでbuildする。
- UTF-8 CSVのdeterministic table Candidate、UTF-8 JSON / 汎用XMLの明示Tree Candidateに加え、UTF-8 XLSXの単一シート表Candidate（shared strings + inline strings、archive/zip + encoding/xmlで解析）を実装する（仮実装。XLSXの複数シート・merged cells・数式・スタイル等は未対応）。
- XLSX、XML Spreadsheet 2003、CP932、provider-dependent処理は未対応である。`.xml`のXML Spreadsheet 2003 signatureは汎用Treeへ誤流入させずfail-closedで拒否する。
- CSVの空行/空列分割、title/header判定、Candidate claim、provenance、fingerprint、referenceはTypeScript参照実装のCSV経路を移植する。

## 実行

```sh
go test ./...
go build -trimpath -ldflags="-s -w" -o mmi-portable-go-minimum .
./mmi-portable-go-minimum ../../test/fixtures/portable-core-v1/csv-table.case.json
./mmi-portable-go-minimum ../../test/fixtures/portable-core-v1/json-tree.case.json
./mmi-portable-go-minimum ../../test/fixtures/portable-core-v1/xml-tree.case.json
./mmi-portable-go-minimum ../../test/fixtures/portable-core-v1/xml-tree-namespace.case.json
```

この実装をCore採用候補とみなす条件は、現在のfixtureを通すことだけではない。TypeScript側でbaseline responseを固定し、追加corpusでもCandidate semanticsが一致すること、XLSX経路、native/WASMのsize/startup/memory比較を満たす必要がある。

## 2026-10-04 実測

`go1.23.2 linux/amd64`でshared CSV conformance caseを実行し、source digest、Candidate位置・provenance・fingerprint・referenceまで一致した。CSV parserにはTypeScript参照実装と同じBOM、CRLF、quoted comma、escaped quote、quoted newline、trim、unterminated quoteの回帰を追加し、`maxScanCells`はnative / wasm32で受理範囲が変わらないよう`int64`で保持する。このCSV段階のGo test suiteはnativeと標準Go WASMの両方で全件通過した。

その後、同じportable request/response契約へJSON Treeも実装した。object keyのJavaScript互換UTF-16順、JSON Pointerの`~0` / `~1`、Claim、provenance、subtree fingerprint、負のゼロ、非finite数値、孤立surrogate、U+2028/U+2029をTypeScript参照実装と揃え、ASCIIだけで偶然一致しないUnicode fixtureも追加した。JSON Tree追加後のGo suiteはこのセッションでは実行していないため、上記のnative / WASM通過実績と区別して扱う。

stripした標準Go native binaryは1,953,944 bytes、Windows amd64 cross-buildは2,084,864 bytes、標準Go WASMは3,336,196 bytesだった。同じCSV requestに対しnativeとWASMのJSON出力はbyte-for-byteで一致した。

このLinux containerでのprocess実行は、native 100回の中央値が約1.00 ms、peak RSS 30回の中央値が約2.4 MiBだった。標準Go WASMをNode `wasm_exec_node.js`で起動した場合、30回の中央値は約72.11 ms、peak RSS 10回の中央値は約51.8 MiBだった。これはbrowser/WASMや長寿命hostの性能を表す値ではなく、短命processとしての初期比較である。

TinyGoはこの環境に無いため未測定。標準Go native/WASMの結果だけでtoolchainを選定しない。

機械可読な詳細は [evidence/2026-10-04-standard-go-csv.json](evidence/2026-10-04-standard-go-csv.json) を参照する。

2026-10-05にCSVの座標契約を修正し、先頭空レコードを物理行として保持するようTypeScript参照実装と標準Go実装を揃えた。上記の2026-10-04 evidenceはこの変更前の履歴であり、現行Go suiteの通過証拠には使わない。再計測時は、先頭空レコード、通常の末尾改行、末尾の空レコードを含む追加回帰も通過条件に含める。


## 2026-10-08 XML Tree拡張

標準Go最小実装へ汎用XML Treeを追加した。TypeScriptの`mmi.xml-tree-adapter`と同じqualified-name sibling path、Claim列、provenance v2、`xml-subtree-canonical-v1` fingerprintをshared fixtureで固定する。

`xml-tree.case.json`は候補数だけでなく3 CandidateすべてのClaim、provenance version、fingerprint digestまで固定した。さらに`xml-tree-namespace.case.json`を追加し、prefix付き要素・属性、namespace declaration属性、同名sibling ordinalをTypeScript / Go共通corpusにした。

Go側は標準ライブラリの`encoding/xml`をRawTokenで使い、元のqualified nameを保持する。DTD/declaration、UTF-8以外のXML宣言、未宣言prefixをfail-closedで拒否する。XML Spreadsheet 2003はまだ表decoder未実装のため、汎用XML Treeとして処理せず明示的に拒否する。

このセッションではGitHub checkoutを作れないため、リポジトリ正本の`go test ./...`は未実行である。一方、追加したXML parser/canonical fingerprint部分だけを標準Goで独立再現し、basic fixtureの3 fingerprintとnamespaced fixtureの3 fingerprintが事前計算値と一致すること、DTD・非UTF-8宣言・未宣言prefixが拒否されることを確認した。これはfocused source-level reproductionであり、正本suite通過の代替証拠にはしない。
