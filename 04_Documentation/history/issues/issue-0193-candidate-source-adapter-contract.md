# Issue: Candidate・Source Adapter・provenanceの共通契約を定め、既存の研究を対応付ける

## Meta
- Type: Feature
- Status: Done（契約v1。fingerprintの台帳での使い方はissue-0195で確定）
- Priority: High
- Scope: 02_Architecture（契約）、src/core（型・runtime不変条件・機械可読schema）、src/cli（`schema candidate` / `inspect --json`）、Source Adapter、test
- Expected verification level: unit

## Traceability
- Related ADR/Spec: ADR-0019 D4・D6・D10（優先度1）、ADR-0018 D1〜D5、ADR-0020
- Related analysis: [製品価値と現行実装のギャップ](../../../02_Architecture/product-gap-analysis.md) §2「候補抽出」、§5
- Dependency: なし。issue-0194・0195はこの契約に依存する

## 背景

ADR-0019は、入力形式とMarkdown出力を直接結ばず、Source Adapter → Observed Structure → Semantic Candidateの順に扱うと定めた。現行の製品には共通の型がなく、表の領域検出（`src/search/regionDetector.ts`）は検索専用の型（`DetectedRegion`）を返す。研究層（structured artifact、worksheet format、review route）はそれぞれ独自の型を持ち、製品から読み込まれていない。

## Acceptance criteria
- [x] Candidateの最小の型を設計文書と`src/core`に定める。少なくとも、種別（ADR-0019 D4）、source locator、認識論上の状態（`observed`・`inferred`・`abstained`）、実行特性（`deterministic`・`provider-dependent`）、method class（ADR-0020 M0〜M5）、根拠（algorithm/provider、version、reason code、evidence）、fingerprintを持つ。採用・却下・修正等のreview stateは別契約とし、Candidateの認識論状態へ混ぜない。
- [x] 異なるproviderのconfidenceを共通の尺度に合成しない（ADR-0018 D4）ことを型で表す。
- [x] 表の領域検出を、最初のSource Adapterとして`Table / Range`のCandidateへ変換する。原本セル座標は`observed + deterministic`、規則から求めた領域境界・見出しは`inferred + deterministic`として区別する。
- [x] `mmi inspect --json`がCandidateの一覧を返し、各Candidateが従う契約名`mmi.semantic-candidate/v1`を`candidateContract`として併記する。`mmi schema candidate`から同契約のJSON Schemaを取得できる。既存のテキスト出力と`reference`の値は変えない。
- [x] 研究層の成果を、ギャップ分析§5の表に沿ってCandidate種別・層・状態へ対応付ける。対応しないものは理由を書く。研究コードの移動・削除はしない。
- [x] 認知機能の有無で、`check`の診断と`render`の論理表が変わらないことをテストで確かめる。
- [x] deterministic pathはinput digest + config + implementation versionで再現可能にし、provider-dependent pathはprovider/model/artifact version/parametersをprovenanceに保持できる契約にする。

## Validation plan
`npm test`で新しい単体テストと既存の全テストを実行する。キットと実務サンプルに`mmi inspect --json`を実行し、Candidateの件数が既存の表の領域と一致することを確かめる。

## 結果（2026-10-01）
- 契約は[Semantic Candidate契約 v1](../../../02_Architecture/candidate-contract-v1.md)。実装は`src/core/candidate.ts`（型とruntime不変条件）、`src/core/candidateContract.ts`（`mmi.semantic-candidate/v1` JSON Schema）、各Source Adapter、`mmi schema candidate`、`mmi inspect --json`の`candidateContract` / `candidates`で共有する。
- 状態・実行特性・method classは**主張ごと**に持たせた。表の座標は`observed`（M0）、境界・表題・見出しは`inferred`（M1）。見出しが不確かなときは値を持たない`abstained`の主張にする。providerのscoreは`provider`と`scale`で区別する一覧で、最上位の`confidence`は型に存在しない。
- 実務サンプルの全20ブックと基本設計書キットのマスター（5シート）で、Candidateの件数が既存の領域と一致し、`reference`も一致した。`check`の診断と`render`の論理表は、候補生成の前後で変わらない。
- 研究層の対応表を契約文書§6に確定した。**旧ギャップ分析§5の誤りを訂正した**: `hierarchy_relation`・`repeated_block`・`ambiguous_or_non_table`は生成コードが無く、Tree・Note・List・Sectionは未着手。

## Remaining work
- fingerprintは暫定（表示セル値の列のsha256、位置を含まない）。台帳での使い方（移動・再取り込みの判定）をissue-0195で確定し、必要なら`representation`を上げる。
- Cognitive Contractの状態語彙をCandidateへ変換する実装（契約文書§5の案）。provider依存の経路を最初に実装するときに行う。
- 領域検出を`src/core`へ移す作業はissue-0203。
