# Issue: portable coreと最小バイナリ配布方式を比較・固定する

## Meta
- Type: Architecture / Evaluation
- Status: Draft
- Priority: Medium
- Scope: Core boundary、CLI packaging、WASM、toolchain evaluation
- Expected verification level: integration + benchmark

## Traceability
- Related ADR/Spec: ADR-0019 D10・D15、製品要求「配布サイズとランタイム」
- Dependency: issue-0193（Candidate / Source Adapter契約）、issue-0197（CLI配布）

## 背景

MMIはVS Code拡張だけでなく、CLI、AI/CI、将来の他IDE、Web/WASMから利用する。全経路で、必要な機能と安全性を満たす候補のうち配布物・実行時依存が最小の方式を優先する。

GoをCoreの有力候補とするが、標準Go固定にはしない。TinyGo等で同じCore契約を満たせるなら小型配布を優先する。将来、Go互換性の高いsmall-binary toolchainが成熟した場合も比較できるようにする。

## Acceptance criteria

- [ ] VS Code固有APIをCoreから排除する境界を設計し、CLIとVS Codeを同じApplication/Core APIのhost adapterにする。
- [ ] Candidate、SourceLocator、diagnostics、provenance、inspect/check/render/extract等のI/Oを言語非依存・JSON serializableな契約として整理する。
- [ ] 最小縦切り（例: inspect + CSV/Excel table Candidate）を標準GoとTinyGoでビルドし、機能差・binary size・startup・memoryを比較する。
- [ ] native desktopとWASMの両経路を比較し、VS Code Desktop / VS Code Webでのhost境界を整理する。
- [ ] TinyGo未対応機能がある場合、Coreを劣化させず、host/native profileへ分離できるか判断する。
- [ ] conformance corpusが標準Go / small-binary buildで一致することを採用条件にする。
- [ ] 将来toolchain比較用に、binary size、Go/stdlib互換性、OS/WASM対応、性能、メモリ、debug、license、maintenanceの評価表を残す。
- [ ] Hike類似技術は、Go互換性・安定性・保守性が基準を満たすまで必須依存にせず、watch対象として扱う。

## Validation plan

同一fixtureと同一JSON contractを使い、標準Go / TinyGoの出力一致を確認する。Windows/Linux native、可能ならWASMについてbinary size、cold start、peak memoryを測定する。差が出た場合はサイズ優先で仕様を変えず、toolchainまたはhost profile側の制約として記録する。

## Remaining work

- Go移行そのものは本Issueの完了条件にしない。まずportable core boundaryと評価基準を固定する。
- Hike類似技術のwatchは定期的に見直すが、成熟前にproduction dependencyへ入れない。
