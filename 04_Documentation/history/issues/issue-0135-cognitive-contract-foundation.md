# Issue: 特定providerに依存しないCognitive Contractの基盤を定義する

この文書は2026年9月19日のCognitive Contract実験に関する履歴記録である。**Cognitive Contract**は認知支援部品が観測・判断候補を受け渡すための共通データ型、**provider**はその情報を供給する部品、**provenance**は入力や処理の出典情報、**abstention**は判断を保留する結果を指す。**confidence**はproviderが独自の意味・尺度で示すスコアであり、異種provider間で単純に合算できる値ではない。ここに記載したunit testの成功はexperimental型の検証であり、production runtimeやAuthority Planeとの接続を示さない。

## Meta
- Type: Feature / Architecture
- Status: Done
- Priority: High
- Scope: `02_Architecture/cognitive-assistance-plane.md`, `03_Implement/src/experimental/cognitiveContract.ts`, focused tests
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: requirements.md Phase 13
- Related ADR/Spec: ADR-0018-cognitive-assistance-plane.md
- Depends on: なし

## 当時の実行計画
### 解決方針（当時の提案）

Authority Planeへ接続しないpure TypeScript contractとして、Cognitive Assistance Planeの共通型を定義する。初期contractはprovider実装を持たず、observation / signal / abstention / provenance / provider descriptor / provider固有confidence metadataだけを固定する。

provider categoryは少なくとも `perception` / `judgment` / `reasoning-generation` を表現できる。confidenceは単一numberへ潰さず、namespace / semantics / valueを保持し、異なるnamespaceをmergeするhelperは作らない。

### 受入条件（Acceptance criteria）
- [x] Authority PlaneとCognitive Assistance Planeのデータフローをarchitecture文書へ固定する。
- [x] observation / signal / abstention / provenanceの型をpure TypeScriptで定義する。
- [x] provider capability categoryを明示できる。
- [x] confidenceはprovider namespaceと意味定義を保持し、異種confidenceを共通尺度として扱わない。
- [x] `abstained` / `unsupported` / `unavailable`を正常な結果として表現できる。
- [x] observationは正本へのwrite handleを要求しない。
- [x] network / filesystem / VS Code / SheetJS / Jev SDK / LLM SDKへ依存しない。
- [x] parser / resolver / renderer / workbookLoaderから呼ばない。
- [x] focused unit testで正常系・abstention・不正metadataを固定する。
- [x] contractの存在有無で既存MMI runtime semanticsが変化しない。

### 作業項目（Task breakdown）
- [x] architecture文書で境界とデータフローを定義。
- [x] contract型と最小validation helperを追加。
- [x] confidence namespace / abstention / provenance testを追加。
- [x] 同時進行のfill telemetry laneが`experimental/README.md`を更新していたため競合回避でREADMEは編集せず、`02_Architecture/cognitive-assistance-plane.md`を直接導線として固定。
- [x] strict TypeScript compile + focused unit test。
- [x] 検証後StatusをDoneへ更新。

### 当時の検証計画（Validation plan）

strict TypeScript条件で対象module/testをcompileし、provider category、confidence metadata、abstention、provenanceを確認する。repository検索でproduction importが存在しないことも確認する。GitHub Actionsの既知runner/resource不足は完了条件にしない。


## Validation evidence

### 2026-09-19 local focused validation

- Node.js: `v22.16.0`
- TypeScript: `5.8.3`
- compile: `--strict --target ES2022 --module NodeNext --moduleResolution NodeNext` で成功
- focused unit test: **8 tests / 8 pass / 0 fail**
- 次の項目を検証した。
  - provider category / execution boundary
  - namespaced score semantics
  - observation provenance / source digest
  - explicit `abstained / unsupported / unavailable`
  - blank identity / duplicate capability / empty capability rejection
  - non-finite / out-of-range score rejection
  - invalid runtime status / implicit external boundary rejection
  - invalid signal / evidence metadata rejection
- production parser / resolver / renderer / workbookLoaderは変更していない。
- branch差分は新規architecture文書、experimental contract、専用test、および本Issueの完了記録のみ。
- 同時進行のfill review telemetryはmain側でissue-0139として統合済み。編集ファイル集合は本実装と交差しない。
- GitHub Actionsの既知runner/resource不足は完了条件に使用しない。
