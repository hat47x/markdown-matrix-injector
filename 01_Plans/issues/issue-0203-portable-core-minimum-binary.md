# Issue: portable coreと最小バイナリ配布方式を比較・固定する

## Meta
- Type: Architecture / Evaluation
- Status: In Progress
- Priority: Medium
- Scope: Core boundary、CLI packaging、WASM、toolchain evaluation
- Expected verification level: integration + benchmark

## Traceability
- Related ADR/Spec: ADR-0019 D10・D15、ADR-0020 D4・D9、製品要求「配布サイズとランタイム」
- Dependency: issue-0193（Candidate / Source Adapter契約）、issue-0197（CLI配布）

## 背景

MMIはVS Code拡張だけでなく、CLI、AI/CI、将来の他IDE、Web/WASMから利用する。全経路で、必要な機能と安全性を満たす候補のうち配布物・実行時依存が最小の方式を優先する。

GoをCoreの有力候補とするが、標準Go固定にはしない。TinyGo等で同じCore契約を満たせるなら小型配布を優先する。将来、Go互換性の高いsmall-binary toolchainが成熟した場合も比較できるようにする。

## Acceptance criteria

- [ ] VS Code固有APIをCoreから排除する境界を設計し、CLIとVS Codeを同じApplication/Core APIのhost adapterにする。
- [ ] Candidate、SourceLocator、diagnostics、provenance、inspect/check/render/extract等のI/Oを言語非依存・JSON serializableな契約として整理し、deterministic pathとprovider-dependent pathをApplication API上でも区別する。
- [ ] 最小縦切り（例: inspect + CSV/Excel table Candidate）を標準GoとTinyGoでビルドし、機能差・binary size・startup・memoryを比較する。
- [ ] native desktopとWASMの両経路を比較し、VS Code Desktop / VS Code Webでのhost境界を整理する。
- [ ] TinyGo未対応機能がある場合、Coreを劣化させず、host/native profileへ分離できるか判断する。
- [ ] conformance corpusが標準Go / small-binary buildで一致することを採用条件にする。
- [ ] 将来toolchain比較用に、binary size、Go/stdlib互換性、OS/WASM対応、性能、メモリ、debug、license、maintenanceの評価表を残す。認知model/profileはbinary sizeと分けてartifact sizeとして測定する。
- [ ] Hike類似技術は、Go互換性・安定性・保守性が基準を満たすまで必須依存にせず、watch対象として扱う。


## Implementation checkpoint (2026-10-04)

最初の縦切りとして、言語非依存の`mmi.portable-core-request/v1` / `mmi.portable-core-response/v1`を追加した。requestはsource bytesをbase64で内包し、Coreへfilesystem capabilityを渡さない。Hostがsourceを読み、workspaceや権限を管理し、Coreはbytes・論理label・設定だけからCandidateを返す境界とした。

契約型は`src/application/portableCoreContract.ts`へ分離し、Node APIをimportしない。現行TypeScriptの参照実装は`portableCoreProtocol.ts`であり、NodeのSHA-256と既存SheetJS / Source Adapterを使う。この実装がportable runtimeであるとは扱わず、portableなのはJSON contractとhost/Core責務の分離である。

v1は`inspect`かつdeterministic-onlyに限定する。CSV / XLSX / XLSM / XML Spreadsheet 2003の表CandidateとJSON Tree Candidateを対象とし、`allowProviderDependent: true`、未知field、非canonical base64、未対応formatをfail-closedで拒否する。画像・Shape・provider-dependent認知、`check` / `render` / `extract`は後続へ残す。

CLIには`mmi core <request.json|->`を追加した。source bytesはrequest内にあるため、この経路はsource pathを探索・読込しない。process-levelのJSON境界として、将来の標準Go / TinyGo / WASM実装と同じrequestを比較できる。

`test/fixtures/portable-core-v1/`へCSV表とJSON Treeのconformance caseを追加した。`test/portableCoreProtocol.test.ts`では、fixtureのsource digest / Candidate種別 / locator / provenance / fingerprint representationを確認し、生成XLSXについてportable経路のCandidate列が既存`tableCandidates()`直呼びと完全一致することを固定した。source名が存在しないpath風文字列でも埋込bytesだけで処理できること、空CSV、provider-dependent拒否、schema expansion拒否も対象とする。

TypeScript参照実装の正本suiteは、この実行コンテナに`xlsx` / `tsx`がなく依存取得もできないため、まだ実行していない。一方、標準GoのCSV最小実装はshared `csv-table.case.json`を実行し、source digest、Candidate位置、provenance、fingerprint、referenceまで一致した。Go側の現行test suiteはnativeと標準Go WASMの両方で通過した。

実装過程では、未統合Go sourceにliteral BOMと不正なCR/LF rune表現がありコンパイルできない問題を実行で検出し、portableなescapeへ修正した。また`maxScanCells`をGoの`int`で保持するとnativeとwasm32で受理可能範囲が変わるため、`int64`へ変更し、JavaScript safe integer上限までTypeScript contractと同じ受理規則にした。

2026-10-04の初期実測では、strip済み標準Go native（linux/amd64）が1,953,944 bytes、Windows amd64 cross-buildが2,084,864 bytes、標準Go WASMが3,336,196 bytesだった。shared CSV requestに対するnative / WASMのJSON出力はbyte-for-byteで一致した。Linuxの短命process測定ではnative 100回の中央値が約1.00 ms、peak RSS中央値が約2.4 MiB、Node `wasm_exec_node.js`経由WASM 30回の中央値が約72.11 ms、peak RSS中央値が約51.8 MiBだった。これはbrowser / 長寿命WASM hostの性能を意味しない。TinyGoは現環境に無く未測定である。

機械可読なartifact hash・測定値は`03_Implement/portable/go-minimum/evidence/2026-10-04-standard-go-csv.json`を正とする。

詳細な境界は[Portable Core Contract v1](../../02_Architecture/portable-core-contract-v1.md)を正とする。

## Validation plan

同一fixtureと同一JSON contractを使い、標準Go / TinyGoの出力一致を確認する。Windows/Linux native、可能ならWASMについてbinary size、cold start、peak memoryを測定する。差が出た場合はサイズ優先で仕様を変えず、toolchainまたはhost profile側の制約として記録する。

## Remaining work

- 追加したTypeScript conformance corpusを依存が揃った通常開発環境で実行し、v1 baseline responseを固定する。
- 標準GoのCSV table Candidateはshared contractで初期conformanceを確認済み。次はXLSX decodeの候補を比較し、TypeScriptと同じCandidate semanticsを依存サイズ込みで評価する。
- TinyGo native / WASMを同じcorpusで測定し、標準Go native / WASMの実測値とbinary size、startup、peak memory、互換性を比較する。現環境ではTinyGo未導入のため未測定。
- CLI `inspect`とVS Code側Candidate列挙を段階的に同じApplication/Core APIへ収束させる。二重実装を残したままGo移行を始めない。
- `check` / `render` / `extract`のJSON contractは、inspect v1の境界が実測で成立してから追加する。
- Go移行そのものは本Issueの完了条件にしない。まずportable core boundaryと評価基準を固定する。
- Hike類似技術のwatchは定期的に見直すが、成熟前にproduction dependencyへ入れない。
