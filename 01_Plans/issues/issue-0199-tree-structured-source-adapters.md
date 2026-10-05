# Issue: JSON・YAML・XML・フラットテキストからTree / Hierarchy Candidateを取り出す

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
- [x] フラットテキスト用Structuralizerの最小契約を定め、インデント、見出し番号、接頭辞コードの3方式を個別に有効化できる。
- [x] Excel / CSVの親列や階層列を同じTree Candidateへ写し、inspect→extract→ledger→detach freshnessまで同じ採用ライフサイクルへ接続する。
- [x] `observed` / `inferred` と `deterministic` / `provider-dependent` をAPI・JSON出力で直交して表現し、推定にはmethod class、evidence、algorithm/provider version、reason codeを残す。フラットテキストの階層推定は`inferred + deterministic + M1`として記録する。
- [x] 決定論的規則であっても複数の構造が成立する場合は自動確定せず、複数候補または`abstained`を返す。deterministicであることを事実性の根拠にしない。
- [x] Treeの内部表現とMarkdown上の表現を分離し、nested list / headings / Mermaid等を後から選べる。JSONの初期版はnested list Projectionを別モジュールとして実装した。
- [x] JSONと汎用XMLの明示Treeは、同じ入力・設定からAuthority部分の構造を決定論的に再現でき、外部LLMやGPUを必要としない。推定Treeにも同じ原則を適用する。

## Current slice

JSONと汎用XMLに加え、安全subsetのYAML明示構造を同じ`tree` Candidate契約へ接続した。JSONとYAMLはobject / array、XMLはelementを`observed + deterministic + M0`として扱う。JSONとYAMLの位置にはRFC 6901 JSON Pointer、XMLにはqualified nameと同名兄弟の出現順から作るelement pathを`structuralPath`へ保持する。YAMLはYAML 1.2のJSON互換データモデルに限定し、anchor / alias / merge key / explicit tag / 非string key / 非finite numberをfail-closedで拒否する。JSON/YAMLの整数は、原本値を倍精度浮動小数点で損失なく保持できるJavaScript safe integer範囲に限定し、それを超える整数は丸めてCandidate化しない。これらYAML固有機能や表現不能な数値を変換してから「明示構造」と見なすことはしない。XMLの属性、本文、親子関係もClaimへ残す。

CLIの`inspect`、`extract --tree`、VS CodeのCandidateレビュー、`mmi-ledger.json`、detach前のfreshness確認はJSON/XMLで同じ経路を使う。Portable Coreの`inspect`もJSON/XML Treeへ接続し、通常Adapter直呼びと同じCandidate列を返すconformanceを固定する。レビュー後の採用ではsubtree fingerprintを現在のsourceと再照合し、対象subtreeが変わっていれば採用しない。対象外のbranchだけが変わった場合は、同じsubtreeの採用を妨げない。

XML Spreadsheet 2003は既存のworkbook/table経路を維持する。その他のXMLだけをTree Adapterへ流す。構文解析にはnamespaceを有効にした`saxes`を使い、未束縛のprefixやnamespace展開後に重複する属性などのwell-formedness違反を拒否する。XML Treeのnested list Projectionではelement名、属性、本文を保持する。DTDに依存する解釈は行わない。汎用XMLはUTF-8をfatal decodeし、XML宣言が別encodingを指定する場合もfail closedとする。日本語を含むUnicodeのelement名・属性名も扱う。

フラットテキストの最小Structuralizerも同じ`tree` Candidate契約へ接続した。`.txt`・`.text`・`.log`をUTF-8として厳密に読み、インデント、見出し番号、接頭辞コードを独立したM1方式として評価する。原文の行と行番号、見出し番号や接頭辞コードはM0の`observed` Claimとして保持し、親子関係、深さ、構造位置はM1の`inferred` Claimとして分ける。各Candidateには方式名、evidence、reason code、algorithm versionを残す。

複数方式が異なる親子関係を返しても統合しない。`inspect`は方式ごとのhypothesisを並べ、edgeが一致しなければ`treeAmbiguous: true`としてレビューを求める。方式内部で親が欠ける、番号や接頭辞コードが重複する等、一意に決められない場合は、その方式を`abstained`とする。`--tree-method`で方式を個別に有効化でき、非テキストsourceへ指定した場合はエラーにする。

フラットテキストTreeもCLIの`inspect` / `extract --tree`、VS CodeのCandidateレビュー、`mmi-ledger.json`、detach前のfreshness確認へ接続した。Extractedでは、レビューした`text:<method>:line:<n>`を同じ方式で再構築し、subtree fingerprintが一致した場合だけnested Markdownへ投影する。対象subtreeが変われば採用しない。別のrootだけが変わり、対象subtreeの内容と構造が同じ場合は採用を妨げない。

Excel / CSVの親列・階層列も同じTree Candidate契約へ接続した。親ID列またはlevel列は利用者が明示指定し、固定規則による親子関係を`inferred + deterministic + M1`として保持する。曖昧なheader、欠損parent、cycle、level jump等は推測で補わず`abstained`とする。

CLIでは`inspect --tree-parent-columns` / `--tree-level-columns`で列挙したCandidateを、同じ設定の`extract --tree`でnested Markdownへ採用できる。採用時にはreview時fingerprintを再照合でき、標準`mmi.ledger/v1`へ記録する。抽出provenanceにはsheetと階層列設定を可逆に保存し、detach前には同じStructuralizerを再実行するため、対象subtreeの変更はstaleとして止め、別rootだけの変更は採用済みsubtreeを不要にstale化しない。

VS Codeでは「表の列を指定して階層Candidateを確認」から、対象シートと親ID方式またはLevel方式、対応する列を明示して同じTree Candidateをレビューできる。通常のCandidateレビューに追加質問は入れず、階層を確認したいときだけ専用入口を使う。採用・却下・保留、fingerprint再照合、ledger、freshnessは既存レビュー経路を再利用し、別の権限体系や台帳は作らない。

## Validation plan

JSON・YAML・XMLの明示構造はfixtureで親子関係、fingerprint、review guard、ledger、detach freshnessを確認する。YAMLではanchor / alias / merge key / explicit tag / 非string key / YAML 1.1 / 非finite number / 非UTF-8 bytesをfail-closedの回帰対象とする。XMLではnamespace未束縛、展開後の重複属性、不正な文字参照、非UTF-8 bytes・encoding宣言もfail-closedの回帰対象とする。配布CLIのoffline smokeでもJSON / YAML / XML Treeの`inspect` / `extract`を実行する。XML Spreadsheet 2003はTreeではなく既存の表経路へ残ることを確認する。

フラットテキストでは、3方式の独立有効化、M0観測とM1推定の分離、方式間の構造不一致、親欠落・重複markerによる`abstained`、非UTF-8入力、review時fingerprint guard、ledger、detach freshnessを回帰対象にした。回帰テストは追加済みだが、この作業環境ではリポジトリ全体の依存をmaterializeできないため、正本suiteを実行済みとは扱わない。

表形式Treeでは、VS Codeレビューinventoryが保持するsheet・列設定・structuralPath・fingerprintを、そのまま既存のextract→`mmi.ledger/v1`へ渡せることを縦通しで固定する。`.xls`も`.xlsx` / `.xlsm` / CSVと同じ明示列レビュー経路から扱い、ファイル選択段階だけでlegacy Excelを除外しない。

## Remaining work

- structured artifactの `hierarchy_relation` はissue-0193の対応表を通してPerception providerとして再利用する。
- Choice list / ListはTreeと共通のNode表現を使えるか、実装時に判断する。
