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
- [x] 汎用XMLからelementの親子関係を保持し、属性・本文を失わずCandidateへ写せる。XML Spreadsheet 2003は従来どおり表として扱い、汎用XMLのTree経路と分離する。
- [ ] フラットテキスト用Structuralizerの最小契約を定め、少なくともインデント、見出し番号、接頭辞コードの3方式を個別に有効化できる。
- [ ] Excel / CSVの親列や階層列を同じTree Candidateへ写す拡張点を定める。実装範囲は最小fixtureでよい。
- [ ] `observed` / `inferred` と `deterministic` / `provider-dependent` をAPI・JSON出力で直交して表現し、推定にはmethod class、evidence、algorithm/provider version、reason codeを残す。
- [ ] 決定論的規則であっても複数の構造が成立する場合は自動確定せず、複数候補または`abstained`を返す。deterministicであることを事実性の根拠にしない。
- [x] Treeの内部表現とMarkdown上の表現を分離し、nested list / headings / Mermaid等を後から選べる。JSONの初期版はnested list Projectionを別モジュールとして実装した。
- [x] JSONと汎用XMLの明示Treeは、同じ入力・設定からAuthority部分の構造を決定論的に再現でき、外部LLMやGPUを必要としない。推定Treeにも同じ原則を適用する。

## Current slice

JSONと汎用XMLの明示構造を、同じ`tree` Candidate契約へ接続した。JSONはobject / array、XMLはelementを`observed + deterministic + M0`として扱う。位置はJSONではRFC 6901 JSON Pointer、XMLではqualified nameと同名兄弟の出現順から作るelement pathを`structuralPath`へ保持する。XMLの属性、本文、親子関係もClaimへ残す。

CLIの`inspect`、`extract --tree`、VS CodeのCandidateレビュー、`mmi-ledger.json`、detach前のfreshness確認はJSON/XMLで同じ経路を使う。レビュー後の採用ではsubtree fingerprintを現在のsourceと再照合し、対象subtreeが変わっていれば採用しない。対象外のbranchだけが変わった場合は、同じsubtreeの採用を妨げない。

XML Spreadsheet 2003は既存のworkbook/table経路を維持する。その他のXMLだけをTree Adapterへ流す。XML Treeのnested list Projectionではelement名、属性、本文を保持する。DTDと外部entityに依存する解釈は行わず、決定論的に読めない入力はfail closedとする。日本語を含むUnicodeのelement名・属性名も扱う。

残るTree一般化は、インデント・見出し番号・接頭辞コード等から構造を推定するフラットテキストと、Excel / CSVの親列・階層列である。これらは明示構造ではないためM1以降として扱い、曖昧な場合に自動確定しない。

## Validation plan

JSONとXMLの明示構造はfixtureで親子関係、属性・本文、fingerprint、review guard、ledger、detach freshnessを確認する。XML Spreadsheet 2003はTreeではなく既存の表経路へ残ることも回帰対象とする。今後追加する推定構造ではmethodとevidenceを必須とし、曖昧なfixtureを誤確定しないことを確認する。

## Remaining work

- インデント、見出し番号、接頭辞コードによるフラットテキストStructuralizerをM1として追加し、曖昧な入力では複数候補または`abstained`を返す。
- Excel / CSVの親列・階層列を同じTree契約へ写す最小fixtureを追加する。
- YAMLはJSON Adapterと契約を共有できるかを確認してから追加する。
- structured artifactの `hierarchy_relation` はissue-0193の対応表を通してPerception providerとして再利用する。
- Choice list / ListはTreeと共通のNode表現を使えるか、実装時に判断する。
