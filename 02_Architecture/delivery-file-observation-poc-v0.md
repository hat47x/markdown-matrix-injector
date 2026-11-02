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
