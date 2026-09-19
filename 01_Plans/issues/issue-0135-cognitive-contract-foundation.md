# Issue: provider-neutral Cognitive Contract foundation

## Meta
- Type: Feature / Architecture
- Status: Open
- Priority: High
- Scope: `02_Architecture/cognitive-assistance-plane.md`, `03_Implement/src/experimental/cognitiveContract.ts`, focused tests
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: requirements.md Phase 13
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md
- Depends on: なし

## Execution Plan
### Proposed solution

Authority Planeへ接続しないpure TypeScript contractとして、Cognitive Assistance Planeの共通型を定義する。初期contractはprovider実装を持たず、observation / signal / abstention / provenance / provider descriptor / provider固有confidence metadataだけを固定する。

provider categoryは少なくとも `perception` / `judgment` / `reasoning-generation` を表現できる。confidenceは単一numberへ潰さず、namespace / semantics / valueを保持し、異なるnamespaceをmergeするhelperは作らない。

### Acceptance criteria
- [ ] Authority PlaneとCognitive Assistance Planeのデータフローをarchitecture文書へ固定する。
- [ ] observation / signal / abstention / provenanceの型をpure TypeScriptで定義する。
- [ ] provider capability categoryを明示できる。
- [ ] confidenceはprovider namespaceと意味定義を保持し、異種confidenceを共通尺度として扱わない。
- [ ] `abstained` / `unsupported` / `unavailable`を正常な結果として表現できる。
- [ ] observationは正本へのwrite handleを要求しない。
- [ ] network / filesystem / VS Code / SheetJS / Jev SDK / LLM SDKへ依存しない。
- [ ] parser / resolver / renderer / workbookLoaderから呼ばない。
- [ ] focused unit testで正常系・abstention・不正metadataを固定する。
- [ ] contractの存在有無で既存MMI runtime semanticsが変化しない。

### Task breakdown
- [ ] architecture文書で境界とデータフローを定義。
- [ ] contract型と最小validation helperを追加。
- [ ] confidence namespace / abstention / provenance testを追加。
- [ ] experimental READMEから導線を追加。
- [ ] strict TypeScript compile + focused unit test。
- [ ] 検証後StatusをDoneへ更新。

### Validation plan

strict TypeScript条件で対象module/testをcompileし、provider category、confidence metadata、abstention、provenanceを確認する。repository検索でproduction importが存在しないことも確認する。GitHub Actionsの既知runner/resource不足は完了条件にしない。
