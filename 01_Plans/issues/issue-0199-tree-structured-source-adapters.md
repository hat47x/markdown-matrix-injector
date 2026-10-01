# Issue: JSON・XML・フラットテキストからTree / Hierarchy Candidateを取り出す

## Meta
- Type: Feature
- Status: Draft
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

- [ ] JSONからobject / arrayの親子関係をTree / Hierarchy Candidate（`observed`）として列挙できる。
- [ ] 汎用XMLからelementの親子関係を保持し、属性・本文を失わずCandidateへ写せる。XML Spreadsheet 2003の既存表処理と誤混同しない。
- [ ] フラットテキスト用Structuralizerの最小契約を定め、少なくともインデント、見出し番号、接頭辞コードの3方式を個別に有効化できる。
- [ ] Excel / CSVの親列や階層列を同じTree Candidateへ写す拡張点を定める。実装範囲は最小fixtureでよい。
- [ ] `observed` / `inferred` と `deterministic` / `provider-dependent` をAPI・JSON出力で直交して表現し、推定にはmethod class、evidence、algorithm/provider version、reason codeを残す。
- [ ] 決定論的規則であっても複数の構造が成立する場合は自動確定せず、複数候補または`abstained`を返す。deterministicであることを事実性の根拠にしない。
- [ ] Treeの内部表現とMarkdown上の表現を分離し、nested list / headings / Mermaid等を後から選べる。初期版はnested listでよい。
- [ ] 同じ入力・設定からAuthority部分のTree構造が再現でき、外部LLMやGPUを必須にしない。

## Validation plan

JSON、XML、インデント付きテキスト、番号付きテキスト、曖昧なテキストをfixtureとして用意する。明示構造は期待する親子関係と完全一致すること、推定構造はmethodとevidenceを伴うこと、曖昧なfixtureでは誤確定しないことを確認する。既存の表参照・XML Spreadsheet 2003の回帰テストも実行する。

## Remaining work

- YAMLはJSON Adapterと契約を共有できるかを確認してから追加する。
- structured artifactの `hierarchy_relation` はissue-0193の対応表を通してPerception providerとして再利用する。
- Choice list / ListはTreeと共通のNode表現を使えるか、実装時に判断する。
