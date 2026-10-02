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

- [x] JSONからobject / arrayの親子関係をTree / Hierarchy Candidate（`observed`）として列挙できる。
- [x] 汎用XMLからelementの親子関係を保持し、属性・本文を失わずCandidateへ写せる。XML Spreadsheet 2003の既存表処理と誤混同しない。
- [x] フラットテキスト用Structuralizerの最小契約を定め、少なくともインデント、見出し番号、接頭辞コードの3方式を個別に有効化できる。
- [x] Excel / CSVの親列や階層列を同じTree Candidateへ写す拡張点を定める。実装範囲は最小fixtureでよい。（親ID列のみ。階層列・Excelのインデント／行グループは未対応）
- [x] `observed` / `inferred` と `deterministic` / `provider-dependent` をAPI・JSON出力で直交して表現し、推定にはmethod class、evidence、algorithm/provider version、reason codeを残す。
- [x] 決定論的規則であっても複数の構造が成立する場合は自動確定せず、複数候補または`abstained`を返す。deterministicであることを事実性の根拠にしない。
- [x] Treeの内部表現とMarkdown上の表現を分離し、nested list / headings / Mermaid等を後から選べる。初期版はnested listでよい。
- [x] 同じ入力・設定からAuthority部分のTree構造が再現でき、外部LLMやGPUを必須にしない。

## Validation plan

JSON、XML、インデント付きテキスト、番号付きテキスト、曖昧なテキストをfixtureとして用意する。明示構造は期待する親子関係と完全一致すること、推定構造はmethodとevidenceを伴うこと、曖昧なfixtureでは誤確定しないことを確認する。既存の表参照・XML Spreadsheet 2003の回帰テストも実行する。

## 結果（最初の縦切り）

### 実装

- Treeの内部表現 `src/core/tree.ts`（kind・label・値・順序つき属性・子・locator。森として持つ）と、Projection `src/core/treeProjection.ts`（入れ子の箇条書きのみ）を分けた。行頭の番号・`#`・`>`・`-`と、コードスパン外の`<`はエスケープする。
- JSON（`adapters/jsonTreeAdapter.ts`）: 自前の小さなパーサ。`JSON.parse`が行う整数風キーの並べ替えと重複キーの黙った上書きを避け、キー順・数値の原文・行番号・JSON Pointerを保つ。重複キーは両方残して警告する。
- 汎用XML（`adapters/xmlTreeAdapter.ts`）: 依存なしの最小パーサ。element・属性（順序つき、名前空間宣言を含む）・テキスト・CDATA・コメント・PIを別ノードで保つ。要素間の空白だけのテキストは捨て、configに記録する。XML Spreadsheet 2003（表の読込と同じシグネチャ判定）は`MMI_TREE_XML_SPREADSHEET`で拒否し、`mmi inspect`は従来どおり表として扱う。DOCTYPEのSYSTEM/PUBLIC、内部サブセットの実体宣言、未定義の実体参照は解決せず拒否する。UTF-8以外の宣言も拒否する。
- フラットテキスト（`adapters/textTreeStructuralizer.ts`）: インデント・番号（`1.`・`1.1`・`(1)`・`1)`、全角数字）・接頭辞コード（`--prefix`の正規表現。親は「区切り文字までの最長の既出コード」）を個別に有効化できる。結果は`inferred`・M1で、evidenceに規則・行番号・問題箇所、provenanceに方式・変種・版を持つ。タブ幅で読みが変わる混在、2つの段の間への字下げ戻り、番号の飛び・重複・親の欠落、コードの重複、方式どうしの不一致では1つに決めず、構造ごとのCandidateに`alternative`と`abstained`の`selection`を付ける。構造がなければ全主張`abstained`のCandidateを返す。`.md`ではフェンス内のコードを除き、見出し記号と箇条書き記号をlabelから外す。
- Candidate化（`adapters/treeCandidates.ts`）: `tree`種別。主張は`hierarchy`・`roots`・`lines`（`observed`）と、曖昧時の`alternative`・`selection`。fingerprintは`tree-shape-labels-v1`（行番号を含めない）。契約は[Candidate契約](../../02_Architecture/candidate-contract-v1.md) §3c。
- CLI: `mmi tree <file> [--method auto|indent|numbering|prefix] [--prefix <regex>] [--max-depth n] [--max-nodes n] [-o out.md] [--json]`（`src/cli/tree.ts`）。出力の先頭に出典・fingerprintのHTMLコメントを付ける。曖昧なときは候補をstderrに列挙して終了コード1、何も書き出さない。`mmi inspect`は`.json`・汎用`.xml`・`.txt`・`.md`でTree Candidateを`candidates`に載せ、`tree`欄に状態と候補の一覧（ノードの中身は含めない）を出す。CSV・xlsx・XML 2003の出力は変えていない。
- 上限: 深さ64・ノード数100000（`--max-depth`は1000まで）。超えたら木を返さず`MMI_TREE_LIMIT_*`の診断を出す。
- 拡張点: `treeFromParentColumn()`（行・ID列・親列から木を組む。ID重複・親の欠落・循環では木を返さない）。CLIには結んでいない。

### 検証

- `test/treeAdapters.test.ts`（22件）: JSON・XMLの親子関係の完全一致、XML Spreadsheet 2003の拒否と表としての`inspect`、XXE系5種の拒否、深さ・ノード数の上限、インデント・番号・接頭辞の期待構造、曖昧fixture（タブ／スペース混在、字下げ戻り、番号の飛び・重複・親欠落、コード重複、方式の不一致）で誤確定しないこと、同一入力の再現性と移動後のfingerprint不変、CSVの親ID列から木を組む1件、CLIと`inspect`。`test/cli.test.ts`・`test/candidate.test.ts`と合わせ34件すべて成功。
- 全体の`test/*.test.ts`で、失敗するテスト名の集合が変更前（44件、研究層など）と同じであることを比較した。型検査は追加・変更ファイル由来のエラー0件（既存の15件のみ）。
- 実データ: `04_Documentation/*.md` 13文書に`mmi tree`を3方式で実行した。`indent`は5文書（how-it-works、reference、scenario-sier-design-docs、user-manual、vscode-e2e-testing）で構造を返し、入れ子の箇条書き（「操作手順:」の下の番号付き手順など）を正しく子として写した。残る8文書は字下げのある行がなく「構造なし」。`numbering`は1件も確定しなかった。how-it-worksでは目次の番号付きリストと本文の番号が重複して2候補になり、他は番号付き行が少ない、入れ子がない、番号付きリストの番号の繰り返し、のいずれかで構造なしとした。`auto`は4文書で確定し、how-it-worksでは3候補を列挙して終了コード1、8文書で構造なし。`04_Documentation/samples`のJSON 2件と汎用XML 1件は期待どおりの木になり、XML 2003の`migration.xml`は`tree`で拒否、`inspect`で従来どおり表になった。

### 未対応

- Markdownの見出し（`#`の段）による階層。現状は見出しもすべて最上位ノードになるため、Markdown文書の章構成は取れない（Section Candidateとあわせて別途）。
- インデントの段の幅の不揃い（同じ親の下で2と3が混在するなど）は、字下げ戻りの場合しか曖昧として扱っていない。
- 文字コードはUTF-8のみ（XMLのShift_JIS宣言は拒否、`.txt`のCP932は未対応）。YAML、Excelのインデント・行グループ・階層列、親列のCLI接続。
- 取り込み台帳（issue-0195）との結合。Tree Candidateは`locator.range`を持たないため、台帳上の場所キーが区別されない。
- 投影はnested listのみ。値の中の`*`・`_`などのMarkdown記法はエスケープしていない。

## Remaining work

- YAMLはJSON Adapterと契約を共有できるかを確認してから追加する。
- structured artifactの `hierarchy_relation` はissue-0193の対応表を通してPerception providerとして再利用する。
- Choice list / ListはTreeと共通のNode表現を使えるか、実装時に判断する。
- Markdown見出しの段を4つ目の方式として追加するか、Section Candidateに任せるかを決める（実データ確認で、`.md`の章構成は現行3方式では取れなかった）。
- `treeFromParentColumn()`を`inspect`・`tree`へ結ぶ（列の指定方法、表Candidateとの関係）。
- Tree Candidateの台帳上の場所キー（issue-0195）と、`mmi extract`相当の取り込み経路。
- Projectionの追加（見出し・Mermaid）。
