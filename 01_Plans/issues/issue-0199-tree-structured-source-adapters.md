# Issue: JSON・XML・フラットテキストからTree / Hierarchy Candidateを取り出す

## Meta
- Type: Feature
- Status: In Progress
- Priority: Medium
- Scope: src/core（Source Adapter / Structuralizer）、src/cli（inspect / extract）、test/fixtures、docs
- Expected verification level: integration

## Traceability
- Related ADR/Spec: ADR-0019 D4〜D7（優先度3）、ADR-0018、ADR-0020、製品要求「構造化」「データソース」
- Related analysis: [製品価値と現行実装のギャップ](../product-gap-analysis.md) §2「構造化」・§5
- Dependency: issue-0193（Candidate / Source Adapter / provenanceの共通契約）

## 背景

Tree / HierarchyはExcel固有の機能ではない。JSONやXMLは親子関係を明示的に持ち、Excel・CSV・プレーンテキストではインデント、番号体系、親列、接頭辞、行グループ等から階層を見いだせる。入力形式ごとにMarkdown変換器を増やすのではなく、Source Adapter / Structuralizerから共通のTree / Hierarchy Candidateへ正規化し、表示方法は後段のProjectionとして分離する。

MMIの認知は、明示構造を推測し直すためではなく、形式だけでは確定できない暗黙構造の候補化に使う。JSON/XMLの明示親子関係はM0の`observed + deterministic`、indent / 番号 / 親列等の固定規則はM1の`inferred + deterministic`とする。M2〜M4は、M1で扱えないfixtureが確認された場合だけ比較する。

## Acceptance criteria

- [x] JSONからobject / arrayの親子関係をTree / Hierarchy Candidate（`observed`）として列挙できる。RFC 6901 JSON Pointerを`structuralPath`として保持する。
- [ ] 汎用XMLからelementの親子関係を保持し、属性・本文を失わずCandidateへ写せる。XML Spreadsheet 2003の既存表処理と誤混同しない。
- [ ] フラットテキスト用Structuralizerの最小契約を定め、少なくともインデント、見出し番号、接頭辞コードの3方式を個別に有効化できる。
- [ ] Excel / CSVの親列や階層列を同じTree Candidateへ写す拡張点を定める。実装範囲は最小fixtureでよい。
- [ ] `observed` / `inferred` と `deterministic` / `provider-dependent` をAPI・JSON出力で直交して表現し、推定にはmethod class、evidence、algorithm/provider version、reason codeを残す。
- [ ] 決定論的規則であっても複数の構造が成立する場合は自動確定せず、複数候補または`abstained`を返す。deterministicであることを事実性の根拠にしない。
- [x] Treeの内部表現とMarkdown上の表現を分離し、nested list / headings / Mermaid等を後から選べる。JSONの初期版はnested list Projectionを別モジュールとして実装した。
- [ ] 同じ入力・設定からAuthority部分のTree構造が再現でき、外部LLMやGPUを必須にしない。

## Current slice

JSONの明示構造を最初の縦切りとして実装した。object / arrayだけを`tree` Candidateとし、親子関係、node type、直下のscalar値を`observed + deterministic + M0`として保持する。object keyはfingerprint計算時に辞書順へ正規化し、array順序は保持する。位置はRFC 6901 JSON Pointerで表し、セル座標とは別の`structuralPath`として扱う。

CLIでは`mmi inspect <file.json>`でTree Candidateを列挙し、`mmi extract <file.json> --tree <pointer|root>`で選択したsubtreeをnested listのMarkdown assetへ取り込む。ProjectionはSource Adapterから分離し、Markdown記号を含むJSON文字列も表示上の意味が変わらないようエスケープする。採用時は既存の`mmi-ledger.json`へoccurrence、subtree fingerprint、出力digest、変換条件を記録する。

`mmi:extracted-tree` provenanceはdetach前のfreshness確認にも接続した。対象subtree以外の変更は採用を失効させず、対象subtreeの内容が変わった場合は`changed`としてdetachを止める。VS CodeのCandidateレビューUIにもJSON Treeを追加し、表・画像と同じ採用・却下・保留・ledger filter・facetを利用する。採用時は一覧表示時のsubtree fingerprintを再照合し、そのpointerの内容が変わっていれば`MMI_TREE_REVIEW_STALE`で採用を止める。XML、フラットテキスト、Excel / CSVの階層推定は未実装である。

## Validation plan

JSON、XML、インデント付きテキスト、番号付きテキスト、曖昧なテキストをfixtureとして用意する。明示構造は期待する親子関係と完全一致すること、推定構造はmethodとevidenceを伴うこと、曖昧なfixtureでは誤確定しないことを確認する。既存の表参照・XML Spreadsheet 2003の回帰テストも実行する。

## Remaining work

- 汎用XMLの明示親子関係をM0のTree Candidateへ写し、XML Spreadsheet 2003の表経路と明確に分離する。
- インデント、見出し番号、接頭辞コードによるフラットテキストStructuralizerをM1として追加し、曖昧な入力では複数候補または`abstained`を返す。
- Excel / CSVの親列・階層列を同じTree契約へ写す最小fixtureを追加する。
- YAMLはJSON Adapterと契約を共有できるかを確認してから追加する。
- structured artifactの `hierarchy_relation` はissue-0193の対応表を通してPerception providerとして再利用する。
- Choice list / ListはTreeと共通のNode表現を使えるか、実装時に判断する。
