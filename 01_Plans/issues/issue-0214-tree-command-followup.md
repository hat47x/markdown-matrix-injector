# Issue: 単独の`mmi tree`コマンドを、mainのTree経路へ載せるかを決める

## Meta
- Type: Feature（移植の判断と設計。本Issueの作成ではコードを変更しない）
- Status: Draft（推奨案で仮決定済み。利用者の承認待ち。2026-10-09）
- Priority: Low（採用の経路`extract --tree`は既にある。閲覧の利便性の差である）
- Scope: src/application（表示用の読み取り結果）、src/cli（`mmi tree`の追加、投影の共有）、test、04_Documentation/user-manual.md
- Expected verification level: integration
- Source: `419183a`（ローカルブランチ`feature/issue-0199-tree-source-adapters`。`integration/2026-10-02`にも含まれる。`origin/main`には含まれない）
- Checked against: `origin/main` b9fe717（2026-10-09時点）

## Traceability
- Related: [issue-0199](issue-0199-tree-structured-source-adapters.md)。枝の`mmi tree`はこの計画の一部として書かれたが、mainの計画には現れない。
- Related: [issue-0203](issue-0203-portable-core-minimum-binary.md)（Candidate生成はapplication層が正規経路。`candidateInventoryHostParity.test.ts`で固定）
- Related: [issue-0197](issue-0197-cli-distribution.md)（配布CLIのoffline smoke）
- Related Spec: [Candidate契約v1](../../02_Architecture/candidate-contract-v1.md) §3d〜§3f、§4
- Dependency: [issue-0193](issue-0193-candidate-source-adapter-contract.md)（Candidate / Source Adapterの共通契約）

## 背景

issue-0199の最初の縦切りは、枝で次を実装した。木の型（`core/tree.ts`）、入れ子の箇条書きへの投影（`core/treeProjection.ts`）、JSON・汎用XML・フラットテキストの自前アダプタ、そして`mmi tree`コマンドである。枝は基点`52f71ea`（2026-10-02）の上に`419183a`の1コミットを載せたものである。

その後mainは807コミット進み、同じ領域を別の形で実装した。YAML、表の親列・Level列、`inspect`のCandidate、`extract --tree`による採用、台帳、鮮度確認、Candidate生成のapplication層への移動である。mainの`01_Plans`・`src/cli`・`04_Documentation`の履歴には`mmi tree`の文字列が一度も現れない（`git log -S`で確認）。移植されなかったのか、判断されなかったのかは記録から判別できない。

本Issueは、移植するかどうかと、移植するならどこまでにするかを決める。判断は次の順で行う。

1. 単独コマンドがmainに何を足すか（1節）
2. 枝だけにあるコードは何か（2節）
3. mainのどのファイルに合わせるか（3節）
4. 二つ目のTree経路になる危険（4節）
5. 推奨スコープと、その仮決定（5節・6節）

## 1. 単独`mmi tree`が加えるもの

| 観点 | main（`inspect` / `extract --tree`） | 枝（`mmi tree`） |
| --- | --- | --- |
| 木の全体を見る | 手段が無い。`inspect`はpointerの一覧で、中身を出さない | 入れ子の箇条書きを一度に出す |
| 採用の副作用 | `extract`はassetを書き、既定で`mmi-ledger.json`へ記録する | 読むだけ。`-o`で別ファイルへ書ける |
| フラットテキストの全体 | pointer `text:<method>:line:<n>`を1行ずつ指定する。全体を出す入口が無い | 有効な方式を全部並べて出す |
| 方式名 | `indent` / `heading-number` / `prefix-code`。`prefix-code`は固定規則 | `indent` / `numbering` / `prefix`。`prefix`は`--prefix`の正規表現 |
| 番号の読み | 半角の`1.`・`1.1`・`1)`のみ | 加えて`(1)`と全角数字 |
| JSONの並び | 子ノードはキーの辞書順（`jsonTreeAdapter.ts`の`entriesOf`）。読み込みは`JSON.parse`で、重複キーは後勝ちになり警告が無い | 原本の順。重複キーは両方残して警告する |
| XML | element・属性・textのみ。CDATAはtextへ併合し、comment・PIは捨てる | comment・PI・CDATAを別ノードで保持する |
| `.md` | 対象外 | 対象（フェンス内を除き、見出しと箇条書きの記号を外す） |
| 上限 | 深さ・ノード数の上限が無い | 深さ64、ノード数100000。超えると木を返さず診断する |
| 曖昧なとき | `inspect`は方式ごとの仮説を並べ、統合しない。終了コードは変えない（usage errorを除き0） | 候補を標準エラーへ列挙し、終了コード1で何も書かない |
| 投影の形 | ルートは`root`。object / arrayに`(object)` / `(array)`を付け、キーと値はJSON文字列で書く | ルートは`$`で注記が無い。先頭に`mmi:tree`コメントを付ける |

このうち単独コマンドの本質的な追加は、先頭の2行である。採用せずに木の全体を一度に読めることが、main に無い価値である。ほかの行は、adapterごとの仕様の差であり、それぞれ個別に判断する（6節）。

## 2. 枝にしかないコード

| ファイル（枝`419183a`） | 行数 | 内容 | 扱い |
| --- | --- | --- | --- |
| `03_Implement/src/core/tree.ts` | 208 | 木の型（`TreeNode`、位置情報）、`canonicalTree`、`treeEdges`、`treeFromParentColumn`（未配線） | 表示専用の型だけ移す。`treeFromParentColumn`は移さない（mainの`tabularHierarchyAdapter.ts`が同じ役割を担う） |
| `03_Implement/src/core/treeProjection.ts` | 84 | 入れ子箇条書きへの投影（`projectNestedList`） | 移さない。mainの`extractTree.ts`の描画を使う |
| `03_Implement/src/cli/tree.ts` | 219 | `runTree`、`readTreeSource`（adapterを直接呼ぶ）、`formatTreeInspect`、`mmi:tree`コメント | コマンドの骨格だけを使う。adapterの直接呼び出しはapplication層経由に書き換える |
| `03_Implement/src/cli/mmi.ts`（+32） | | `tree`のcase、USAGE、フラグ、`inspectSource`の早期return、`InspectResult.tree` | caseとUSAGEだけ移す。早期returnと`tree`欄は移さない |
| `03_Implement/src/adapters/jsonTreeAdapter.ts`（200）・`xmlTreeAdapter.ts`（303） | | 自前の最小パーサ | mainに同名の別実装がある（add/add競合）。移さない |
| `03_Implement/src/adapters/textTreeStructuralizer.ts`（520）・`treeCandidates.ts`（222） | | 方式、alternative / selection、`tree-shape-labels-v1`のfingerprint | mainの`flatTextTreeStructuralizer.ts`と概念が重なる。移さない |
| `03_Implement/test/treeAdapters.test.ts`（468行、22件） | | adapterとCLIの期待 | CLIの期待（出力の形、無書き込み、XML 2003の拒否）だけ移す。adapterの期待はmain版へ書き直す |
| `02_Architecture/candidate-contract-v1.md` §3c | | 枝の節 | mainの§3cは既にExcel Drawing Shapeで使用中である。節を足すなら§3hにする |
| `04_Documentation/user-manual.md`（+1行） | | 利用案内 | 移植時に書き直す |

## 3. mainのどこに合わせるか

- `03_Implement/src/application/sourceCandidateInventory.ts`の`collectStandaloneTreeCandidates`: Candidateの正規経路である。JSON・YAML・XML・テキストを読み、Candidateと`nodes`を返す。`nodes`はXMLの要素と本文の順序を失っている（`childPointers`と`leafValues`へ平坦化されている）。
- `03_Implement/src/adapters/jsonTreeAdapter.ts`の`readJsonTree(text, source, digest)`: `JsonTreeDocument.value`を持つ。木の組み立てに使える。
- `03_Implement/src/adapters/xmlTreeAdapter.ts`の`readXmlTree(text, source, digest)`: `XmlTreeDocument.root`の`content`が、要素と本文の順序を保つ。構文解析はsaxesである（枝の自前パーサとは別物）。
- `03_Implement/src/adapters/yamlTreeAdapter.ts`の`readYamlTree`: 枝には無い。
- `03_Implement/src/adapters/flatTextTreeStructuralizer.ts`の`readFlatTextTree(text, source, digest, {methods})`: 方式ごとの仮説を返す（`method`、`status`、`reasonCode`、行単位の`nodes`）。
- `03_Implement/src/cli/extractTree.ts`の`renderNestedList`・`renderXmlNestedList`・`renderFlatTextNestedList`・`renderTabularHierarchyNestedList`: 既存の投影である。いずれも非公開のため、共有モジュールへ出す必要がある。
- `03_Implement/src/application/detachFreshness.ts`: 木の採用の鮮度確認は`mmi:extracted-tree`コメントだけを読む（229行）。
- `03_Implement/test/candidateInventoryHostParity.test.ts`: CLIとVS Codeが同じapplication inventoryを使うことを固定している。新しいTree経路はこの原則に反する。

## 4. 二つ目のTree経路になる危険

1. Candidate: 枝は`tree-shape-labels-v1`のfingerprintと、`hierarchy` / `roots` / `lines` / `alternative` / `selection`の主張を作る。mainは`json-subtree-canonical-v1`（キーをソートして計算）と、`structural-path` / `children` / `leaf-values`等の主張を作る。同じJSONに二つのfingerprintが出る。
2. 投影: 同じJSONに対し、`mmi tree`は`- $`・`- system`の行を出し、`extract --tree`は`root`と`(object)`付きの行を出す。利用者は同じ入力から二種類のMarkdownを見る。
3. 採用の証跡: 枝は`mmi:tree`コメントを付ける。鮮度確認は`mmi:extracted-tree`だけを読むため、`mmi tree -o`の出力は採用の鮮度確認の対象にならない。
4. 曖昧さ: 枝はalternativeとselection（abstainedを含む）で表す。mainは方式ごとの仮説と`ambiguous`フラグで表す。
5. 上限: 枝の上限を`inspect`へ載せると、大きい入力のCandidateの結果が変わる。

防ぎ方（仮決定）:
- 読み取りはapplication層で一回だけ行い、Candidateとtree表示が同じ読み取り結果を共有する。
- 投影は`extract --tree`と同じ描画関数を使う。描画の出力バイトは変えない。
- 出力は標準出力のみとし、採用の証跡（コメント）は付けない。採用は`extract`で行う。
- Candidateの生成、fingerprint、主張、台帳の形式は変えない。

## 5. 推奨スコープ（仮決定）

移植する:
- `mmi tree <source>`の標準出力版。対象は`.json`・`.yaml`・`.yml`・汎用`.xml`・`.txt`・`.text`・`.log`とする。
- 表示専用の木の型。application層の読み取り結果から組み立てる。XMLで要素と本文の順序を保つために必要である。
- 投影の共有。既存の描画関数を、出力を変えずに共有モジュールへ出す。
- USAGEと引数検証。`--method`はmainの方式名を使い、`--from`は`extract`と同じ意味にする。
- CLIのテストと、user-manualの記述。

移植しない:
- 枝のadapter 4件、`treeFromParentColumn`、`treeProjection`、`canonicalTree`、`treeEdges`。
- `--prefix`、`--max-depth`、`--max-nodes`、`--json`、`-o`、`.md`。
- `inspect`の早期returnと`InspectResult.tree`。

mainのadapterとCandidateは変更しない。ただし、application層の読み取り結果に、表示用の文書（adapterの戻り値）を一つ足す変更は必要になりうる。既存の項目を変えない追加とする。

## 6. 決めてほしいこと（推奨案で仮決定）

| # | 論点 | 仮決定（推奨） | 理由 | 変えるなら |
| --- | --- | --- | --- | --- |
| 1 | 木の型を移すか | 表示専用の型だけ移し、application層の読み取り結果から組む | XMLの要素と本文の順序は`nodes`で失われる | 型を使わず`nodes`から組む（XMLの順序は諦める） |
| 2 | 投影 | `extract --tree`の描画を共有する。枝の`treeProjection`は移さない | 投影を二つにしない | - |
| 3 | 出力先 | 標準出力のみ。`-o`は入れない | 採用は`extract`で行い、台帳と鮮度確認に乗せる | `-o`を入れるなら、採用経路と区別する仕様が要る |
| 4 | 曖昧なときの終了コード | 0。全方式を方式名つきで並べ、統合しない。abstainedは理由つきで出す | `inspect`は曖昧さで終了コードを変えない（`mmi.ts`のinspectはusage error以外0を返す） | 1にすると、スクリプトが止まりやすくなる |
| 5 | 方式名と`prefix` | mainの方式名を使う。`--prefix`は入れない | 台帳のpointer `text:<method>:line:<n>`が方式名に依存する。正規表現は再現に必要な設定を増やす | 入れるなら、設定をprovenanceに保存する別Issueにする |
| 6 | 上限 | 入れない。mainの既存挙動に揃える | mainのadapterは上限を持たず、上限はCandidateの結果を変える | 大きい入力の方針を別Issueで決める。深い入力に対するmainの再帰描画の負荷は未確認 |
| 7 | `.md` | 入れない | mainのCandidate契約に`.md`のsource semanticsが無い | 別Issueで契約から決める |
| 8 | XMLのcomment・PI | 出さない | mainのadapterは捨てている。足すとXMLのCandidateが変わる可能性がある（未確認） | Candidateの版を上げる判断を伴う |
| 9 | JSONの並びと重複キー | 出力はmainの辞書順。重複キーの検出は本Issueの外 | `readJsonTree`は`JSON.parse`を使い、重複キーを警告なく後勝ちにする（`jsonTreeAdapter.ts`の294行） | 重複キーは独立の不具合として起票する価値がある |
| 10 | YAML | 含める（`.yaml` / `.yml`） | mainのadapterに既にあり、枝より広い | 外す |
| 11 | `--json` | 入れない。Candidateは`inspect --json`で得る | 既存の契約に寄せる | - |
| 12 | Portable Core（issue-0203） | 対象外（CLIのみ） | 0203はCandidate生成の共有を対象にしている | 対象にするなら0203側で扱う |
| 13 | 枝の扱い | `feature/issue-0199-tree-source-adapters`と`integration/2026-10-02`は変更しない。削除しない | 本Issueでは判断しない | 移植後に決める |
| 14 | README・0199への反映 | 本作業では行わない。`01_Plans/README.md`に行を足すかは別の判断 | README.mdには別セッションの未コミット編集がある | 利用者が決める |

## Acceptance criteria

- [ ] `mmi tree <source>`が、JSON・YAML・汎用XML・テキストの木を、入れ子の箇条書きとして標準出力へ出す。
- [ ] 木の表示とCandidateが、application層の一回の読み取りから作られる。`cli/tree.ts`がadapterを直接importしない。
- [ ] 本文が、同じ部分木の`extract --tree`の描画と一致する。
- [ ] テキストは、有効な方式ごとの仮説を並べ、方式どうしを統合しない。方式名はmainと同じである。
- [ ] XML Spreadsheet 2003を拒否し、表の経路（`inspect`）を案内する。
- [ ] `mmi tree`は、ファイル、台帳、assetを書かない。
- [ ] 既存の`inspect --json`と`extract --tree`の出力、assetのバイト列が変わらない。
- [ ] USAGEとuser-manualに`tree`を載せる。
- [ ] `candidateInventoryHostParity.test.ts`が通る。

## Validation plan

- 無変更の確認: 移植前後で、テスト用fixture（JSON・YAML・XML・テキスト）の`inspect --json`と`extract --tree`の出力、assetのバイト列が同じであることを比べる。
- 同一性: `mmi tree`の本文が、同じ部分木の`extract --tree root`の本文と一致することを確かめる。比較時は`mmi:`コメントを除く。
- 無書き込み: 実行の前後で、作業ディレクトリ、`mmi-ledger.json`、`assets/`が変わらないことを確かめる。
- 層: `cli/tree.ts`が`adapters/`を直接importしないことをテストで確かめる。
- テキスト: 有効な方式ごとの仮説を並べ、方式どうしを統合しないことを確かめる。abstainedは理由つきで出す（0203のhost policyに合わせる）。
- XML: Spreadsheet 2003は拒否し、表の経路を案内する。要素と本文の順序が保たれることを確かめる。
- 既存テスト: `candidateInventoryHostParity.test.ts`と`candidate.test.ts`が通る。
- 配布CLIのoffline smoke（issue-0197）に`mmi tree`を加える。
- typecheck: `grep 'error TS' | sort`の結果を`origin/main`の基準（20行）と比べ、新しい行が無いことを確かめる。
- 全体テスト: Node 20で、失敗するテスト名の集合を移植前後で比べる。研究層の既知の失敗は除く。

## 確認した事実（本Issueの作成時点）

- コードの変更は無い。typecheckとテストは実行していない（対象外）。
- `419183a`の親は`52f71ea`であり、`52f71ea`は`origin/main`の祖先である。`419183a`は`origin/main`に含まれない。
- `origin/main`は作業時点でb9fe717だった。当初の基準57a3cbfはその祖先で、間の10コミットはTree関連のファイルを変えていないことを確認した。
- main側の`inspect`の終了コード（`mmi.ts`）と、`extract`の既定台帳（USAGEの`--ledger`の説明）は、本文の記述どおりである。

## Remaining work

- 仮決定14項目の利用者の承認。変更するものがあれば、6節の表を更新する。
- application層の読み取り結果に表示用の文書を足す設計のレビュー。
- 投影の共有モジュールへの切り出し（出力バイトを変えないこと）。
- 実装。本Issueの次段とするか、このIssueを分割して起票するかを決める。
- 重複キーの警告を、独立のIssueとして起票するかの判断（6節の9）。
- 枝の処分（移植後に決める）。
- 0199の「Remaining work」へ本Issueを参照させるか、`01_Plans/README.md`に行を足すかの判断。
- candidate-contract-v1.mdに節を足す場合は、§3hとする。
