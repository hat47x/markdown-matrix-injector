# Issue: Candidate・Source Adapter・provenanceの共通契約を定め、既存の研究を対応付ける

## Meta
- Type: Feature
- Status: Open
- Priority: High
- Scope: 02_Architecture（契約）、src/core（型と表のAdapter）、src/cli（`inspect --json`）、test
- Expected verification level: unit

## Traceability
- Related ADR/Spec: ADR-0019 D4・D6・D10（優先度1）、ADR-0018 D1〜D5
- Related analysis: [製品価値と現行実装のギャップ](../product-gap-analysis.md) §2「候補抽出」、§5
- Dependency: なし。issue-0194・0195はこの契約に依存する

## 背景

ADR-0019は、入力形式とMarkdown出力を直接結ばず、Source Adapter → Observed Structure → Semantic Candidateの順に扱うと定めた。現行の製品には共通の型がなく、表の領域検出（`src/search/regionDetector.ts`）は検索専用の型（`DetectedRegion`）を返す。研究層（structured artifact、worksheet format、review route）はそれぞれ独自の型を持ち、製品から読み込まれていない。

## Acceptance criteria
- [ ] Candidateの最小の型を設計文書と`src/core`に定める。少なくとも、種別（ADR-0019 D4）、source locator（ファイル・シート・範囲またはZIP内の部品）、状態（`observed`・`inferred`・`confirmed`・`abstained`）、根拠（method、provider/version、reason code）、fingerprintを持つ。
- [ ] 異なるproviderのconfidenceを共通の尺度に合成しない（ADR-0018 D4）ことを型で表す。
- [ ] 表の領域検出を、最初のSource Adapterとして`Table / Range`のCandidateへ変換する。範囲は`observed`、見出しの確度は`inferred`とする。
- [ ] `mmi inspect --json`がCandidateの一覧を返す。既存のテキスト出力と`reference`の値は変えない。
- [ ] 研究層の成果を、ギャップ分析§5の表に沿ってCandidate種別・層・状態へ対応付ける。対応しないものは理由を書く。研究コードの移動・削除はしない。
- [ ] 認知機能の有無で、`check`の診断と`render`の論理表が変わらないことをテストで確かめる。

## Validation plan
`npm test`で新しい単体テストと既存の全テストを実行する。キットと実務サンプルに`mmi inspect --json`を実行し、Candidateの件数が既存の表の領域と一致することを確かめる。

## Remaining work
- fingerprintの方式は種別ごとに異なってよい（ADR-0019 D8）。表は「正規化したセル値の列」か「範囲とsourceのダイジェスト」か、issue-0195と合わせて決める。
- 研究の今後の作業は、この対応表のどの行を強くするかで優先度を決める。
