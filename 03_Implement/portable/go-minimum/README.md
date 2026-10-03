# Standard Go minimum portable Core

issue-0203の比較用実装。production採用を決めるものではない。

## 範囲

- `mmi.portable-core-request/v1` / response v1を使用する。
- 標準ライブラリだけでbuildする。
- 現時点ではUTF-8 CSVのdeterministic table Candidateだけを実装する。
- XLSX、JSON Tree、CP932、provider-dependent処理は未対応である。
- CSVの空行/空列分割、title/header判定、Candidate claim、provenance、fingerprint、referenceはTypeScript参照実装のCSV経路を移植する。

## 実行

```sh
go test ./...
go build -trimpath -ldflags="-s -w" -o mmi-portable-go-minimum .
./mmi-portable-go-minimum ../../test/fixtures/portable-core-v1/csv-table.case.json
```

この実装をCore採用候補とみなす条件は、現在のfixtureを通すことだけではない。TypeScript側でbaseline responseを固定し、追加corpusでもCandidate semanticsが一致すること、XLSX経路、native/WASMのsize/startup/memory比較を満たす必要がある。
