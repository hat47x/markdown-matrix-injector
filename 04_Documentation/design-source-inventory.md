# 設計資料群の目録をCLIで作る

SEI等の生成AI基盤へ設計資料を渡す前に、対象資料と読めなかった範囲を確認する。MMIは原本を変更せず、ファイルごとのSource Identity v1と資料集合のdigestを返す。開発計画は[#618](https://github.com/hat47x/markdown-matrix-injector/issues/618)、この最初の実装は[#620](https://github.com/hat47x/markdown-matrix-injector/issues/620)で管理する。

## 実行する

```sh
mmi inventory ./sources --root . --json -o inventory.json
mmi inventory ./sources --root . --inspect --json -o inventory-inspected.json
```

最初のコマンドは所在とバイト列の同一性だけを収集する。二つ目は既存の`inspect`経路も使い、Candidateの種別別件数と診断コードを返す。原本の本文・見出し・Claim値・例外メッセージは出力しない。パスとdigestも組織の開示方針に従って扱う。

出力先は走査ディレクトリの外に置く。既存のファイルには上書きしない。出力先の指定を省くと標準出力へ書く。シェルのリダイレクトはCLIの出力先検査を通らないため、原本や走査ディレクトリ内へリダイレクトしない。

```sh
mmi inventory ./sources --root . --inspect --json \
  --exclude old-version --exclude private/credentials.txt \
  --max-bytes 8388608 -o inventory-selected.json
```

`--exclude`は走査ディレクトリからの相対パスまたはディレクトリ接頭辞であり、globではない。繰り返し指定できる。既定で`.git`・`.claude`・`node_modules`・`dist`・`artifacts`ディレクトリを除外する。除外したディレクトリの中身は読まず、その中の未走査件数も推定しない。

シンボリックリンクは辿らない。ファイルの読込み上限は既定16 MiB、`--max-bytes`で1〜268435456バイトを指定できる。上限超過はdigestなしの`excluded`になる。目録用のバイト列の取得は上限内に制限する。ただし、`--inspect`による既存解析の再読込み・展開後のOOXMLサイズ・解析時間全体の厳密な上限は保証しない。

## 結果を読む

JSONの`contract`は実験的な`mmi.source-inventory/v0`。各`identity`は既存の`source-file-bytes-v1`とsha256を使う。新しい業務モデルやSEI・TEIの意味受理契約は定義しない。

| 状態 | 意味 |
| --- | --- |
| `identified` | バイト列を識別した。構造解析は要求されていない |
| `inspected` | 既存inspectが返した結果を集計した。業務的な正しさや全情報の抽出は保証しない |
| `unsupported` | バイト列は識別したが、今回の構造解析対象の形式ではない |
| `excluded` | 設定、サイズ、symlink、非通常ファイルなどにより内容を読んでいない |
| `failed` | 読込みまたは解析に失敗した。原因の区分は`reason`で確認する |
| `changed` | 読込み中または解析前後で原本変更を検出した。解析結果は返さない |

`summary`は状態別の目録エントリ数であり、除外ディレクトリの中のファイル数ではない。`status=partial`または解析診断を見落として、案件の設計情報がすべて揃ったと判断しない。

終了コードは、対象範囲の全エントリを識別し、要求した解析にも診断がなければ0、除外・未対応・失敗・変更・解析診断があれば1、引数や実行の失敗は2となる。解析を要求しなければ、PDF等もバイト列の識別までで0になり得る。`inspectionRequested`を必ず合わせて確認する。

`collectionDigest`は、scope、上限・除外設定、安定順序の相対パス、Source Identity、識別できなかった範囲から求める。原本の複製は別の所在として残す。構造解析の結果はdigestの対象に含めないため、解析の採否を示す値として使わない。

同じ設定で再実行してdigestを比べると、観測した資料集合の変化を確かめられる。ただし、除外した部分の内部変更は検出できず、異なるdigestからどの業務上の意味が変わったかも判断できない。

## 確認範囲

`consistency=per-file-observation`は、ファイルを順に観測したことを示す。ディレクトリ全体を一斉に固定したsnapshot、原本の保存コピー、敵対的なファイルシステム変更への完全な隔離ではない。実行中は対象資料を変更しない運用にする。厳密な一時点固定が必要なら、利用者が用意した読み取り専用snapshotを入力する。

この段階では、複数資料の意味統合、TEIモデルの自動生成、SEI/TEIへの送信や依存は追加しない。Data・Function・Businessの不足や矛盾の照合は、目録から必要な原本を選んで既存の`inspect`等で読む後続段階として扱う。SEI/TEIでの実受渡しと実在設計資料での効果は別に確認する。

## 原本範囲のセルと結合を観測する

目録から選んだ資料の範囲を、原本座標を保ったまま読む。第2段階のこの範囲は[#622](https://github.com/hat47x/markdown-matrix-injector/issues/622)で管理する。

```sh
mmi inspect ./sources/申請設計.xlsx --root . \
  --cells --sheet 項目 --range C5:H8 --json

mmi inspect ./sources/申請設計.xlsx --root . \
  --cells --sheet 項目 --range C5:H8 --header-range C5:H6 \
  --expected-source-digest sha256:ここへ目録のidentity.digestを指定 \
  --include-values --json -o selected-cells.json
```

二つ目のdigestは説明用の記載であり、そのままでは実行できない。目録の対象ファイルにある`identity.digest`全体へ置き換える。不一致なら現在の原本を観測したことにせず、出力せずに終了する。実際の解析は、一回取得したバイト列からSource Identityとセルモデルの両方を作る。

このモードは`--json`・`--sheet`・`--range`を必須とし、既存の通常の`inspect`とは区別する。Excel（.xlsx/.xlsm/.xls）、CSV、XML Spreadsheet 2003を対象とする。原本は`--root`内で解決し、16 MiBを超える読込みを拒否する。解析後の展開メモリ・所要時間の厳密な上限を保証するものではない。

出力は実験的な`mmi.source-cells/v0`であり、既存SheetSourceの読み取り専用の投影である。CandidateやTEIの受理済み意味を新たに定義しない。

| 出力 | 読み方 |
| --- | --- |
| `sourceIdentity` | 実際に解析したバイト列のSource Identity v1 |
| `range`・`usedRange`・`address` | 選択範囲、原本の使用範囲、各セルの物理座標 |
| `merges` | 原本に宣言された結合範囲と結合元。選択範囲外の結合元は`anchorOutsideSelection`で示す |
| `presence` | 現行モデルにセルが表現されているか。`not-represented`を未記入・任意・NULLと解釈しない |
| `mergeRole` | 結合元、結合従属、結合なし、重複した結合の曖昧さ。結合元の値は従属セルへ複製しない |
| `valueOrigin` | リテラル、保存済み数式キャッシュ、キャッシュ不在、未観測の区別 |
| `headerSelection` | 呼出し側が見出しとして選んだ範囲。観測済みの業務上の役割や、推定の採用を意味しない |
| `payload` | `--include-values`を明示した場合だけ、モデルの値・表示文字列・数式を含む |

`payload.value`は既存読込みモデルが復号・型変換した値であり、OOXMLの文字列表記やExcel内部の数値をそのまま返すものではない。例えば日付はDateからJSON文字列になるため、`type`と合わせて読む。文字列の先頭ゼロを数値へ変えず、値2と表示文字列`2.00`は別に保持する。表示文字列は既存読込み処理の投影であり、Excel実機の描画との一致確認ではない。数式は実行せず、保存されたキャッシュだけを読む。

現行モデルは、未表現セルと書式だけのstubを区別しない。読込みモデルが保持しない数式や属性は復元しない。空文字の数式結果、キャッシュ不在、原本にセルが表現されない状態は混同しない。表の意味に関する必須・任意や、未記入の理由は推定しない。

範囲は単一セルまたは正順の矩形で、最大4096セル。`--max-cells`でこれ以下の上限も指定できる。不正な座標・逆順・上限超過はセルの実体化前に拒否する。`--header-range`は選択範囲内に限る。必要な結合範囲の座標は示すが、範囲外の値は出力しない。ブック全体は既存の読込み処理で解析し、セルの投影だけを選択範囲へ限定する。

`--cells`の`-o`は`--root`内の新しい出力ファイルに限り、原本や既存ファイルを上書きしない。正常時の終了コードは0、指定不備・境界外・digest不一致・読込み失敗等は2。これは観測出力の成立であり、設計の整合性やTEI化の成功判定ではない。


## 複数資料の明示IDを照合する

第3段階の最初の範囲は[#626](https://github.com/hat47x/markdown-matrix-injector/issues/626)で管理する。利用者が選んだ定義元・参照元のセルだけを比較し、IDの全出現について原本の所在、シート、セル、Source Identityを残す。

選択ファイルはJSON配列とし、各要素に次の6項目を指定する。パスは`--root`からの相対パスであり、選択ファイルからの相対パスではない。

```json
[
  {
    "source": "sources/項目定義.xlsx",
    "sheet": "項目",
    "range": "C7:C30",
    "namespace": "申請項目",
    "role": "definition",
    "expectedSourceDigest": "sha256:目録の対象ファイルのidentity.digestへ置換"
  },
  {
    "source": "sources/処理定義.xlsx",
    "sheet": "入出力",
    "range": "D5:D18",
    "namespace": "申請項目",
    "role": "reference",
    "expectedSourceDigest": "sha256:目録の対象ファイルのidentity.digestへ置換"
  }
]
```

digestは説明用の値を実際の目録の値へ置き換える。`namespace`と`role`は呼出し側の指定であり、資料から認定した業務上の意味ではない。異なるnamespaceのIDは比較しない。見出しを含めず、IDが入るセルを選ぶ。

```sh
mmi match-ids selection.json --root . --json --include-values -o id-matches.json
```

IDそのものを出力するため、`--include-values`を必須とする。出力にはID値・選択条件・出典が含まれる。選択外の本文、表示文字列、数式は出力しない。選択を誤ると本文もIDとして出力され得るため、公開前に選択範囲を確認する。

文字列リテラルを完全一致で比較し、前後の空白、先頭ゼロ、大文字小文字、Unicode表記を変えない。数値、日付、数式、結合セル、空文字・空白だけの文字列、未表現セルは比較から外し、`gaps`に座標と理由を残す。数式の保存済み結果もIDとして採用しない。対象はExcel（.xlsx/.xlsm/.xls）とXML Spreadsheet 2003。既存CSV読込みは引用符のない値の前後空白を除くため、この照合ではCSVを拒否する。

出力は実験的な`mmi.source-id-matches/v0`。`selections`に選択条件と実際に解析したSource Identity、`occurrences`に選択番号とセル座標とIDを置く。`matches`の`definitions`・`references`は、`occurrences`の0始まりの番号を示す。

| `matches.status` | 意味 |
| --- | --- |
| `unique-token-match` | 選択範囲内の定義が1件で、同じnamespaceに参照がある |
| `ambiguous` | 選択範囲内に同じnamespace・IDの定義が複数ある。候補を一つに絞らない |
| `missing-definition` | 選択範囲内に同じnamespace・IDの定義が見つからない |
| `definition-only` | 選択範囲内の定義が1件で、参照が見つからない |

同じID文字列であることから、同じ業務対象だと確定しない。定義不明や参照なしも、選択範囲内の観測に限る。`gaps`に除外した定義が含まれる可能性を残し、案件全体の整合性が確認できたとは扱わない。

選択ファイルは64 KiB以下、選択は1〜16件、合計4096セル以下、原本は1ファイル16 MiB以下。同じ物理セルの重複選択は拒否する。原本の境界・digestを検査し、同じファイルの複数範囲は一回取得したバイト列で読む。ブック全体は既存処理で解析するため、展開メモリや解析時間の厳密な上限は保証しない。資料集合の一時点固定でもない。

`-o`は`--root`内の新規ファイルに限り、既存ファイルを上書きしない。終了コードは、比較が成立し、除外セル・定義重複・定義不明がなければ0、それらがあれば1、指定不備・境界外・digest不一致・読込み失敗なら2。0でも意味統合、Data・Function・Businessの十分性、SEI/TEIへの受渡しの成立は保証しない。
