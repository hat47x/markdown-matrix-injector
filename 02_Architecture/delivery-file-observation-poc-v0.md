# 納品構成MarkdownからのExcelファイル参照観測 PoC v0

- 区分：Issue [#658](https://github.com/hat47x/markdown-matrix-injector/issues/658) の実装試作と受入用メモ
- 範囲：単一のMarkdown本文に書かれた **シート・範囲を指定しないExcelへのMMI参照**
- 実装：`03_Implement/src/application/deliveryFileObservation.ts` の `observeDeliveryFiles`
- テスト：`03_Implement/test/deliveryFileObservation.test.ts`
- 公開契約：**未採用**。CLI／VS Codeコマンド／既存 `mmi manifest` の挙動は変更しない

## 最小利用例

```markdown
# 納品構成
## 基本設計
![[./excel/screen-design.xlsx]]
![[./excel/data-design.xlsx]]
## 試験
![[./excel/test-cases.xlsx]]
```

この記述から、元のMMIパーサーでファイル単位のExcel参照を取り出す。原本を表へ変換せず、Markdown見出しと行番号、参照文字列、Workspace相対パス、存在状態、読み取り可能な場合はsource digestを観測する。

### 取り扱う差異

| 観測結果 | 意味 |
| --- | --- |
| `resolved` | 参照先がWorkspace内にある通常ファイルで、bytesのdigestを取得できた |
| `missing` | 参照先が解決できなかった |
| `outside-workspace` | 許可境界外への参照または既存のsymlink経由の境界外 |
| `not-file` | 参照先がディレクトリ等だった |
| `unreadable` | 権限不足・読込み失敗等により正本bytesを確認できなかった |
| `duplicateOfLine` | 同じ実ファイルへの再参照があった |
| `sameContentAsLine` | 所在の異なるファイルが同じsource bytesだった |

`referentialCompleteness` は参照先が全て `resolved` かだけを表し、`empty`／`complete`／`incomplete` を区別する。**`complete` は契約成果物の網羅性、依存資産を含む納品パッケージの閉包、原本の意味・実形式の検証、検収済み納品版の再現性を意味しない。**

## 実装上の分離

- 既存の `extractEmbedQueries`、`resolveSourcePath`、`readSourceFileIdentity` を再利用する。
- `![[./a.xlsx#Sheet1|A1:B5]]` のような部分表の埋込み、普通のMarkdownリンク、非Excelへの参照、コードフェンス内の例示は、この試作の納品対象候補には加えない。
- 原本を書き換えず、ディレクトリ全体の走査もしない。指定フォルダーの実ファイル集合との比較は既存 [#620](https://github.com/hat47x/markdown-matrix-injector/issues/620) の目録機構との接続を検討する。
- `manifest` はカード扱いの別紙一覧、`check` は既存の参照診断、`provenance` は出典と鮮度、`detach-check` はDetached資産の確認を担う。**本PoCの観測結果でこれらの意味を再定義しない。**
- source digestの取得は観測時点のファイル読取りであり、読み取り途中のファイル置換・巨大ファイルのメモリ消費・本番のTOCTOU保証は未検証。大規模な実利用や企業セキュリティの受入前に境界と資源上限を再評価する。
- Markdownの見出しとコードフェンスの識別はPoC向けの限定的な処理。将来の入れ子Markdown、任意リンク、複雑なMarkdown構文への適合性は検証対象。

## この縦切りから次へ

1. 少数の実務相当Excel参照で出力を確認し、欠落・境界違反・重複・原本非改変の負例を試す。
2. 構文・原本・集合のどの単位で検査する必要があるかを利用者と確認する。
3. #620 の資料目録と結合し、「宣言にあるが見つからない」「配置されているが宣言にない」を区別する。ただし納品対象指定の意味と普通の参考リンクは同じとは限らない。
4. 継続的リファクタリングで必要となる変換前後の対応と、検収済み納品版の保存・再現性を別に検証する。
5. 実務観測は [#524](https://github.com/hat47x/markdown-matrix-injector/issues/524) へ接続する。

本メモは正式な仕様・受入済み機能・Wails本流製品の実装完了を主張するものではない。

---

## 2026-11-02 追補：#658 独立受入の実証計画（提案・未実行）

### 実装と証拠の基準

- 照合main：`e293927e7decb548c9662c4a19a140c1d017a1a8`（[push CI #41268645261](https://github.com/hat47x/markdown-matrix-injector/actions/runs/41268645261) SUCCESS）。[`delivery-audit` PR #675](https://github.com/hat47x/markdown-matrix-injector/pull/675)はmainへ統合済み。上段の「CLIは変更しない」は初期縦切りの履歴であり、**現時点のCLI未実装を意味しない**。
- 既存`deliveryAudit.test.ts`の16件XLSX・9ケースは、合成Workbooksの集合照合・コマンドの既存証拠。**T6/T7/T8の個別受入、顧客原本、VS Code実操作、納品検収はこれに含まれない**。本追補は追加実行結果ではない。
- 上位の順序は[`01_Plans/product-repolish-plan.md` §10.3](../01_Plans/product-repolish-plan.md)と[Issue #658](https://github.com/hat47x/markdown-matrix-injector/issues/658)を参照。本節には#658固有の小fixtureと合否の計算法だけを置く。#525のC-01/T2と#672のHTML監査の受入表を複製しない。

### 評価対象の集合と数え方

- **Declared**：納品構成Markdownで有効な**ファイル全体のMMI Excel参照**として検出した出現。参考説明、インラインコード、コメント、Sheet/Range埋込みは区別して観測する。
- **Observed**：指定フォルダーの`inventory`が確認できた物理エントリ。除外・読込不能・サイズ上限超過などは独立した未観測要素。
- **Required**：契約やOwner判断により必要とされた成果物。外部要求集合の入力がない場合は**不明**とし、Declared=Observedから契約網羅性を導かない。
- **Consumed**：表示や再構成に用いられたSource/Region/Assetの実依存。**Delivered**：固定納品版に実際に含めた資産。現行`delivery-audit`の対象外で、SHO Composer側の文書編纂・固定納品版の計画と接続する後段。
- **出現数／重複を除いた実所在数／異なるbyte digest数／Requiredの件数**は独立に表示・評価する。現在の`matched`は参照出現ごとの一致件数であり、物理ファイル数や契約要求件数と同一ではない。

### T6～T8 最小反例と機械的期待値

| ケース | 固定する入力・期待値 | 現状の根拠と受入に必要な証拠 |
| --- | --- | --- |
| **T6：Markdown上の納品宣言** | `docs/delivery.md` に①複数行HTMLコメントの `![[../excel/samples/comment.xlsx]]`、②インラインコードの `![[../excel/samples/example.xlsx]]`、③コードフェンス内の記法、④**有効な** `![[../excel/delivery/current.xlsx]]` を置く。Excel実体は`excel/samples/`と`excel/delivery/`に分離する。`observeDeliveryFiles.references`は④の**1出現のみ**、`delivery-audit`のinventory scopeを`excel/delivery`にした比較は`matched=1`、`aligned`を期待する。 | 現行`extractEmbedQueries(line)`は行内のMMI文字列を拾い、`deliveryFileObservation.ts`はフェンス以外のコード・コメントを明示除去しない。**静的反例候補**として、修正前CLIのJSON件数・行番号を保存し、同一fixtureに対する修正後を別headで確認。既存`markdownLinks.ts`の`FenceTracker`／`stripInlineCode`を参考に、複数行コメント・一行内の複数参照・フェンス境界も検証する。 |
| **T7：bytesと構造の分離** | 同じ相対pathを指す実体に①小さな正当XLSXと②破損／非OOXMLの`.xlsx`を用意。双方ともDeclaredとObservedのbyte digestが一致し、**集合照合が`aligned`になり得る**。その後、別のWorkbook構造検査を行い、構造未確認／失敗を区別して記録する。 | 既存`delivery-audit`はファイル集合とSource Identityの照合であり、Excel内部構造は保証しない。`inspect`等を使う場合も実際の解析結果を収集し、**「破損なら必ず既存inspectが拒否する」ことは事前仮定にしない**。必要なら構造診断の契約範囲を別に明示する。原本の意味的有用性はさらに独立した受入。 |
| **T8：重複とRequiredの分離** | 同じXLSXを2箇所から参照し、別pathの同bytes複製を1箇所から参照する。期待するのは**参照出現3、実所在2、異なるbytes 1**。 `duplicateReferences=1`、`sameContentDifferentFiles=1`、比較上`matched=3`は共存可能。 | 現行合成テストはこの区別の一部を既に確認。追加の受入票では**Requiredの件数は未設定／未確認**とし、3件を3納品物と推定しない。参考資料か正式納品対象かはOwner判断。 |

**結果の表現**：`aligned`／`differences`／`indeterminate`は「選択された二観測の比較結果」である。T7で`aligned`でも構造診断が未実施なら`structure=not-checked`を**受入票の別欄**として残す（既存JSONスキーマに新フィールドを先行追加する提案ではない）。T8でも`required=unknown`を受入票に残す。0件や未実行を「検査済みOK」に変換しない。

### 後続の追加負例（T6～T8より後）

- **T9：実解決Location**：同じ`design.xlsx`が文書相対位置とWorkspace相対位置に存在する場合、現行`resolveSourcePath`の候補順により意図と異なるSourceを指す可能性を観測する。参照文字列、参照基準、実realpath、Source Digestを別欄に記録する。これは**#658の集合照合の負例**であり、[#525](https://github.com/hat47x/markdown-matrix-injector/issues/525) C-01/T2のCandidate Review→保存後再解決と同じ合格にはしない。
- **T10：読取資源と観測時刻**：`inventory`の`--max-bytes`は目録側を制限する一方、現在の`observeDeliveryFiles`は`readSourceFileIdentity`経由で対象ファイルを一括読込みする。この非対称性の上限・失敗分類と、独立した二回の読込み間の変更を検証する。容量超過・読込み競合を成功にせず、OS間のsymlink/TOCTOU保証を実証なしに断言しない。最初は安全な小fixtureや注入可能なテスト手段で観測する。
- **T11：未参照の非Excel・除外集合**：`inventory.status=partial`がExcel以外の除外資料に由来する場合、Excel参照の一致と、**指定ディレクトリ全体の目録の不完全性**の両方を表示する。対象スコープを変えて数字が変わることを明示する。

### 実行・昇格の順序

1. **D0：fixture固定**。T6/T7/T8それぞれの入力ファイル、Markdown生bytes、配置、期待参照出現、期待資料集合と実行main SHAを残す。T7は正当XLSXと破損XLSXを別bytesとし、byte digestも記録する。
2. **D1：既存CLIでの負例観測**。改変前の`mmi delivery-audit <doc> <directory> --root ... --json`と終了コード、JSON各件数・status・行番号・対象scopeを保存する。静的推定と実測結果を区別する。
3. **D2：必要最小の修正／回帰**。T6の参照抽出が予想と違った場合は既存Markdown解析機構を再利用して修正し、対象外の通常`check`／`manifest`等への影響を確認する。T7のファイル集合検査へExcel全体の業務意味受理を混ぜない。T8は既存重複テストを起点に件数表示・受入票を補う。
4. **D3：配布・実務の別証拠**。Linux/Windows製品テスト、同じ条件でのCLI出力と原本非改変、実案件相当のExcel、可能なら利用者の誤読・手戻りの観察を分離する。通常CI成功をVSCode実機・実案件の受入へ昇格しない。
5. **D4：固定納品版の別レーン**。必要なRequired集合が与えられた場合の照合、Consumed/Delivered・依存画像と変換版、納品時の検査レシートとOwner受理を検証する。作業版との分離と再現性はMMI #658だけの合格条件としない。

### 横断接続と停止条件

- [#525](https://github.com/hat47x/markdown-matrix-injector/issues/525)の**C-01/T2はG0-0未通過**（CLI/共通基盤でfixtureのSHAおよびSheet/Rangeが未一致）。共有ZIP・A/B digest・原本のrealpath・同一候補の照合を先に済ませ、G0 CLI→G1 VSCode→G2横断受入の順序を維持する。**SHO×MMIの保存後出典統合実証はG0-0を満たしてから**実施する。#658のT6～T8は独立したread-only MMI試験として並行可能。
- [#672](https://github.com/hat47x/markdown-matrix-injector/pull/672)のHTML保存後監査とLinuxオフラインtarball配布検査は既存の独立証拠を利用し、#658のExcel納品集合やC-01/T2の再解決PASSに読み替えない。Windows tarball配布・実AIクライアント受入は別扱い。
- 責任分担は**MMI＝Source/Identity/Candidate/出典と観測、SHO Composer＝文書編纂と納品版の表現・人のレビュー、TEI＝受理された意味モデル**。同じ原本・レビュー記録の二重正本、新しいGraph DBや汎用Hostを本PoCの前提にしない。

### Owner判断待ち

1. ファイル全体のMMI参照のうち、どれを**正式納品対象**とみなし、参考用参照とどう区別するか。外部Requiredが無い場合、どの表現までを「網羅」と呼んでよいか。
2. T8の複数参照、同内容別ファイルを**必要納品物数**へ換算する業務規則。
3. 固定納品版に必要な原本・依存・出力・検査記録・レビューの保持範囲と、採用済み版への遡及的な失効条件。

これらの判断は提案として保持し、**本追補の作成、CI成功、byte一致、AIによる判断をOwner受理へ昇格させない**。

### 2026-11-02 追加横断結論：Document Occurrence・証拠・納品版を別に結ぶ（設計候補）

この節は [SHO Composer #1](https://github.com/hat47x/sho-composer/issues/1) のS0/S1、[#4](https://github.com/hat47x/sho-composer/issues/4) の文書保存・引用・再開、[#3](https://github.com/hat47x/sho-composer/issues/3) のCLI証拠境界と突き合わせた**MMI #658側の引渡し条件**である。SHO側のDocument ID、Source Referenceの正式規約、Graph DB、新しいMMI公開Schemaの採用ではない。既存のOwner判断は上記のまま保持する。

#### 参照の出現（Occurrence）と原本・レビューの同一性

- 現在の`DeliveryFileReference.line`と`headings`は、**そのMarkdown観測時の位置**であって安定した文書内Occurrence IDではない。章の移動や改行挿入で位置が変化する。同じ原本が複数回使われ、別原本が同一byte digestを持つ場合、path／digest／lineを一つの永続IDとみなさない。
- **Source Location**（意図された原所在と実際のrealpath）、**Source Identity**（読んだbytes）、**Candidate Identity**（種別・位置・fingerprint・Claims）、**Document Occurrence/Revision**（どの文書版のどの使用箇所か）、**Reviewの現在適用性**をそれぞれ別の確認対象とする。#658のファイル全体参照にはCandidateが存在しない場合があり、その場合は`not_applicable`であって`missing`ではない。
- MMIは既存の生参照・その行／見出し・観測digest・診断を返す。SHO側が文書の章・段落・図表・引用の編集・保存・移動・複製の履歴を所有する。SHOが同じ参照を別章へ移した場合、MMIの新しいlineから、旧レビューの同じ対象だと**自動確定しない**。
- 同byte別所在はSource Identityの一致のみ、同所在別byteはSource変更の候補、旧固定版r1と作業版r2の差分は対象版の相違として提示する。Reviewを撤回した後に原bytesへ戻っても、撤回されたレビューを自動復活させない。

#### 検査の主張と結果を分離する（受入票用。公開JSONではない）

| 独立軸 | ここでの観測例 | PASSから追加して主張できないこと |
| --- | --- | --- |
| **文書作業** | 文書版の保存→再開、本文・出現・編集履歴 | 出典の現在性、納品資格 |
| **出典と表示** | 参照解決Location、bytes一致、表示に実際に使ったSource/Asset | Excel構造・表示の意味正しさ |
| **主張とレビュー** | 説明の対象版、必要根拠、レビュー履歴と適用可能性 | TEI意味モデルAccepted、公開許可 |
| **納品・外部利用** | Requiredとの照合、固定版のDelivered資産、外部開示条件 | 自動Owner検収、別環境での再現性 |

各判定は**`pass`／`fail`／`indeterminate`／`not_evaluated`／`not_applicable`**を独立に持つ候補とする（#658の既存`alignment`値は変更しない）。`not_evaluated`は検査未実行、`indeterminate`は実行したが十分な根拠がない、`not_applicable`は当該対象の性質から検査対象外であることを意味する。0件・未実施・構造未対応をPASSとして集約せず、`fail`が無くても未確認を維持する。

**二方向の検査**を混同しない：Declared→Observedは「宣言された参照が取得できるか」、Observed→Declaredは「物理資料に宣言があるか」であり、いずれもRequired→Deliveredの「要求成果物が固定納品版に対応付くか」とは別の照合である。外部Requiredが無い場合、最後の関係は`not_evaluated`または`indeterminate`のまま扱い、`aligned`を受理印にしない。

#### 追加引渡し用の反例（MMI単独とSHO依存を区別）

| ケース | 刺激と確認する誤推論 | 実証レーン・停止条件 |
| --- | --- | --- |
| **T12：行位置とOccurrence** | 文書内の有効な`![[...]]`を別の章へ移し、上に段落を挿入する。同じSource digestのまま`line/headings`が変わる。旧行番号一致を文書内出現の同一性と推定したり、移動しただけでSource変更と断定したりしない。 | **MMI単独**では観測JSON差分まで先行可能。SHOのOccurrence履歴とレビュー適用性は [SHO #4](https://github.com/hat47x/sho-composer/issues/4)の独立S0/S1で比較し、正式な永続IDは未決。 |
| **T13：読んだbytesと使ったbytes** | `delivery-audit`後に原本を更新してから`render`／`extract`する。古いaudit digestが一致していたことから、新たに消費・表示した内容まで同じと推定しない。再読込の実bytes、観測時点と各実行版を分ける。 | **MMI単独**の逐次反例は実施可能。ただし同時snapshot・transaction保証や外部Provider整合性の成立を仮定しない。 |
| **S1引渡し：固定文書と画像** | 旧固定版のMarkdown Dが不変で参照SVG EだけがE1→E2となる場合、Dの同一性、Eの表示差分、著者説明のレビュー資格、固定納品版の再現を別々に報告する。 | **SHO依存**：[SHO #1](https://github.com/hat47x/sho-composer/issues/1)／[#4](https://github.com/hat47x/sho-composer/issues/4)のS1レーン。#658のExcel集合監査のPASSへは算入しない。保存後出典のMMI×SHO統合受入はC-01/T2 G0-0完了後に限定する。 |

#### 共有できる証拠の最小単位と開示

各試験の**人が読む受入票**には、`testCase`、固定した入力文書bytes/digest、実行したdocument revision、Workspace相対の参照とinventory scope、**当該環境内**の実解決realpath、Source byte digest、MMI build identity／実argv／cwd／終了コード、実JSONの契約名・件数・個別findings、実行前後の原本digest、期待と実際、上記独立軸の判定、未確認理由を添える。実realpathは環境依存の証拠であり、他ホストへ移した後も同じ出典IDとはみなさない。

SHO側へ渡す際は、必要な元データの**表示投影**と、実際の生bytes・Claim値・パスを外部AIへ送る許可を分ける。read-only CLI/MCPであっても公開してよい範囲の自動認可ではない。原本や顧客情報を伴うケースの実送信は専用の権限・開示試験へ分離し、#658の`aligned`のみで許可しない。

#### 再編成した成果物を検収するための最小対応表（後続D4）

将来、Excelを抽出・分割・統合・別紙化して最終成果物へ置き換える場合、**Required（外部要求項目）→利用者が選択したDeclared／原資料の根拠→実際に出力したDelivered資産と版→検査証拠→Owner判断**の対応を、一要求項目ずつ確認する。これは新たな必須DSLや第二の納品台帳を直ちに設ける提案ではなく、案件の既存要求表・レビュー記録に対する**対応表の検証**から始める。複数資料の統合は一対一のファイル数比較では表現しきれず、説明対象の欠落・変更を独立して人が確認する。

固定納品版r1は「r1の当時の入力、出力、表示依存、検査とレビュー」を保持する候補である。作業版r2やTEI受理モデルのr2が生じたことのみを理由に旧版r1を自動失効させず、r2へ旧レビューを自動転用しない。**TEIのモデル意味受理、SHOの文章・納品版、MMIの観測証拠はそれぞれの正本側で扱う。**

**段階の出口**：T6の現在の誤抽出は現行CLIで実測し、必要なら小さな修正へ進める。T7は構造を別検査、T8はRequiredをOwner未設定のまま維持、T12/T13はMMIの独立検証、S1引渡しと固定納品版はSHOの別受入へ渡す。設計追補のCI成功はこれらの実行済み・製品受入を意味しない。

### 2026-11-02 第3追補：母集団・公開一式・比較基準を固定する（計画候補）

本節の対象は**MMIが観測したファイル集合からどこまで結論できるか**である。[MMI製品改善計画 Draft #753](https://github.com/hat47x/markdown-matrix-injector/pull/753) §11.10–11.11の版間Claim・公開Consumer検証、[TEI #2604](https://github.com/hat47x/tei-platform/issues/2604)の一式公開、[TEI Draft #2615](https://github.com/hat47x/tei-platform/pull/2615)の版間候補、[SHO #9](https://github.com/hat47x/sho-composer/issues/9)のPlain-text Benchmarkを参照する。ここでは**物理公開実装・版間意味対応・論文研究のBenchmarkを再起票しない**。#753はOpen/Draft、#2604はOpen、#2615はOpen/Draftであり、各計画を製品の実装・受理済み契約と扱わない。

#### 母集団の閉じ方と比較可能性

「すべて揃った」の**すべて**を判定するには、少なくとも**母集団の出所・範囲・版・時点・列挙の十分性**が必要である。比較を次の三つに分ける。

1. **観測集合の整合（現在の#658）**：指定した`inventoryScope`内の実所在Oと、Markdownから抽出したDeclared Dとの二方向比較。`aligned`は対象として認識したExcel whole-file参照がOと照合できたこと。Oが部分観測なら`indeterminate`の区別を残す。**同じ対象外ファイルがDとOの両方から欠ける**反例を検出できない。
2. **要求集合の被覆（後続D4）**：外部の契約・要求・Owner判断で根拠と版が定まったRequired Rの各**要求項目**について、採用された対応先のDelivered資産・出力版・受入根拠を示せるか。R→Deliveredは**多対多対応**を許し、ファイル数や同digestを単純比較しない。Rの出所が不明、要求範囲がopen-world、または対応が未承認なら「契約完結」を`pass`にしない。
3. **納品版の一式性（SHO側/TEI公開Ownerへ接続）**：固定版の列挙・実収録物・最終閲覧/Consumerが**実際に使用したbytes**を区別。Manifestの一致だけでは未列挙の旧ファイル残存や、Manifest読取り後の差替えを排除できない。物理上の余剰ファイルがただちに契約違反であるとも判断しない。製品のGeneration公開・atomicityはTEI #2604、SHO固定版の受理と表示はSHO #1/#4がOwner。

**根拠を持つcoverage witness（受入票の概念、公開Schemaではない）**：`requirement/source-version-and-scope → declared occurrence(s) → selected delivered artifact revision(s) → inspected consumed bytes → verification result → owner decision`。参照が存在する、関係候補が到達可能である、対象版で構造解析できる、Claimが成立する、公開してよい、を一つのブール値に折り畳まない。新資料が加われば旧Source bytesが不変でも全称Claimの被覆は再確認候補であり、旧固定納品の履歴を自動失効させない。

#### T14～T16：現行PoC固有の追加負例と価値測定

| ID | 入力・刺激 | 期待と所属する実証 |
| --- | --- | --- |
| **T14：Declared=ObservedでもRequiredが欠落** | 外部要求表に`screen`/`data`/`test`の3要求項目。Markdownと対象Excelフォルダーには`screen`/`data`の2件だけを入れる。 | 既存`delivery-audit`の`alignment=aligned`を対照として保存。**Requiredが3である事実**は独立Oracleから読む。要求3件目の被覆は未成立と記録。要求表が無い条件ではRequired自体を`not_evaluated`とする。外部要求の業務役割→成果物の対応の採否はOwner判断。 |
| **T15：固定版の列挙と物理余剰、Consumer読取** | 旧固定r1にA/B、次のr2にAのみを列挙。旧Bが物理フォルダーに残り、別の閲覧処理がBを読んだ場合と読まない場合を分ける。 | #658の目録は物理Bを`inventory-unreferenced`候補として観測できても、**r2の構成不備か単なる保管物か**は確定しない。列挙したDeliveredとConsumerが読んだ実bytesを別票に記録。TEI #2604のPublish実装やSHOの固定納品実証をMMI試験で代替しない。 |
| **T16：単純な方法との比較** | 同じ16件の正常XLSXとT6/T7/T8/T14の合成負例について、A=Markdown手書き一覧＋一般的なファイル列挙/digestスクリプト、B=既存`mmi delivery-audit`。同じ入力情報、権限、期待値を与える。 | **正検出・誤検出・未確認の明示・Source非改変・再現に要する操作/時間・スクリプト保守費**を記録。Aを不当に弱くせず、Bの増分効果と導入負担を両方測る。広域の研究索引・論文→コードの比較はSHO #9へ残し、MMI側は納品集合という狭いユースケースの評価とする。 |

**合格と終了条件**：T14は外部Requiredの不足を機械的`aligned`に隠さず示せれば「判定境界が説明できた」とする。T15は固定版の列挙と物理実所在と実消費を独立に記録する**検査票の作成**までを本PoCの出口とし、原子的公開の保証・正式納品検収を含めない。T16は差がない結果・MMIが不利な結果も保存し、**単なる情報の増量ではなく同情報での誤主張・手戻り・作業負担を比較**する。失敗例を修正するか、対象外と明示するかをデータから選ぶ。

**段階整合**：D0にRの要求票とOwner判断有無・対象母集団のscope/版を追加する。D1にDeclared/Observed/Requiredの異なる母集団の照合を追加し、元CLIの実JSONを改変しない。D3にT16の公平なA/B対照を追加する。D4でDeliveredと実Consumer bytesの対応票を試し、固定納品採否はSHO側Ownerへ委ねる。C-01/T2のG0-0停止条件とTEI #2604の実製品検証Ownerは変更しない。

**状態**：この追補は仕様・検証計画のみ。T14～T16のfixture・CLI/Consumer実行、要求表の業務受理、正式Publish、ユーザー試験、Plain-textに対する優位性実証は**NOT RUN**。現行MMI、SHO、TEIの公開契約・実装・正本を変更しない。
