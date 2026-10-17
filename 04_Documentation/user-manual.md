# MMI 利用マニュアル

Excel・CSV・XMLの表を参照しながら、Markdownで設計書や運用手順書を書くためのガイドです。
初めて使う方は [チュートリアル](tutorial.md) から始めてください。ここではWindowsのデスクトップ版VS Codeを基本に説明します。

## やりたいことから探す

| 目的 | 読むところ・使うサンプル |
|---|---|
| 最初の表を表示する | [チュートリアル](tutorial.md) |
| 参照を選んで作る・直す、表を言葉で探す | [入力を楽にする](#入力を楽にする) |
| 要件や試験の残件を確認する | [要件レビュー](samples/practical/02-requirements.md)、[試験結果](samples/practical/06-testing.md) |
| Excelの設計表を載せる | [権限](samples/practical/04-permissions.md)、[状態遷移](samples/practical/03-workflow.md) |
| 既存のExcel設計書（方眼紙）を移す | [既存のExcel設計書を取り込む](#既存のexcel設計書を取り込む試作) |
| Excelを開かずに表・列・行を選ぶ | [表の目録から選ぶ](#表の目録から選ぶ試作)、[AIエージェント向けの手引き](ai-agent-guide.md) |
| JSONを読みやすく表示する | [API応答例](samples/practical/05-api.md) |
| 大きな表を別紙にする | [大きい表](samples/practical/09-large-table.md) |
| 納品ファイルを確認する | [納品一覧を作る](#納品一覧を作る) |
| PDFを作成する | [PDFを作る](#pdfを作る) |
| エラーの理由を調べる | [困ったとき](#困ったとき) |

## 元データと文書の置き方

```text
案件フォルダー/
  設計書.md
  data/
    要件.csv
    業務設計.xlsx
```

この場合、設計書には `./data/要件.csv` と書きます。Markdownの場所を基準に探し、見つからない場合にワークスペースのルートを探します。
参照対象はワークスペース内に置いてください。外部URLや境界外のファイルを直接参照することはできません。既存のExcelがワークスペース外にある場合、VS Codeの取り込みコマンドでは原本を選んだ後にワークスペース内のコピー先を指定します。CLIでは`mmi import --copy-source <保存先>`を使います。MMIは元ファイルと同じbytesをその保存先へ取り込み、そのコピーをLinked参照の正本として使います。既存の別内容ファイルは上書きしません。

元データの修正はExcelなど、普段使うツールで行います。原本を保存すると、開いているMarkdownがそのブックを参照している場合は、MMIがプレビューと診断を再確認します。表示が変わらないときは、コマンドパレットから`MMI: 参照中の表を再確認`を実行してください。詳しくは[Excelで保存した後に確認する](excel-markdown-authoring.md#excelで保存した後に確認する)に書いています。
MMIには更新日時に基づく読み込みキャッシュがあります。正本と文書の変更を常時監視・自動通知する機能とは異なります。

## 記法の基本

```md
![[./data/業務設計.xlsx#状態遷移|A1:F13?header=first&caption=状態遷移]]
```

`![[`から`]]`までが1つの参照です。`#`の後にシート名、`|`の後にセル範囲、`?`の後に表示の指定を書きます。複数の指定は`&`でつなぎます。
参照は独立した行に置いてください。コードブロックに入れると、記法の説明用になります。

ファイル名・シート名に区切り文字（`#`、`|`、`?`など）を使う運用は避けると扱いやすくなります。
パラメータの値に`&`を含めたい場合は、`%26`のようにURLエンコードします。

## 表の見せ方を変える

| 指定 | 使い方 | 気をつけること |
|---|---|---|
| `header=first` | 範囲の先頭行を見出しにする | 省略時は見出しなし |
| `columns=A,C,F` | 列を選ぶ | 切り出した範囲の先頭をAとして指定 |
| `grep=要確認` | 文字を含む行を選ぶ | 大文字小文字を区別しない部分一致。正規表現ではない |
| `transpose=true` | 行と列を入れ替える | 小さな比較表向け |
| `highlightColumn=状況&highlightValue=要確認` | 一致する行を強調 | 見出し名または表示後の列位置を使う |
| `formatColumn=応答例:json` | JSONをコード表示する | JSONの実行機能ではない |
| `caption=確認対象` | 表題を付ける | 番号は自分で付ける |
| `id=review-items` | 表へのリンク先を付ける | 文書内で重複しないIDを使う |

処理順は「範囲 → 列選択 → 転置 → 見出し → 行検索 → 強調・書式」です。
`B1:F4`を選んだ後の`columns=A,C`は、元シートのB列とD列を指します。
数値の`header`指定は切り出し・変換後の行位置として処理されます。普段は`header=first`を使うと分かりやすくなります。
詳しくは [リファレンス](reference.md) を参照してください。

## 別紙カードを使う

参照範囲が10列を超える、500セルを超える、シートを指定しない、または`mode=card`を付けると、表の代わりにカードになります。
大きさの判定は`columns`や`grep`で絞る前の範囲に対して行われます。

![別紙カード](media/release-20260908/03-attachment-cards.png)

- ファイル名リンク：VS Code内で開きます。Excelはバイナリのため、文字のエディターでは表示できないという案内になる場合があります。
- 「外部アプリで開く」：OSの既定アプリへ渡します。Excel用のアプリが関連付けられている必要があります。
- 外部オープンは信頼済みのローカルワークスペース内の表データが対象です。VS CodeやOSが確認を表示した場合は、開く対象を確認してください。

表にしたいときは`mode=table`を付けます。大量のセルを展開する前に、範囲や列も絞ってください。
MMIは元データを書き換えません。ただし、開いたExcel側で編集・保存すれば通常どおり元データが変わります。

## 入力を楽にする

どの方法でも、参照は選んで確かめてから入ります。候補を自動で確定したり、原本を書き換えたりすることはありません。

Markdownを開いた状態で右クリックすると「MMI: 参照を作成・編集」「MMI: 説明から表を探して参照を挿入」「MMI: コピーした範囲と同じ内容の表を探して参照を挿入」が並びます。参照の作成・編集は **Ctrl+Alt+M**（macOSはCmd+Alt+M）でも開けます。はじめての方は、VS Codeの「ようこそ」→「チュートリアル」の **MMIをはじめる** で順に試せます。コマンド名はVS Codeの表示言語が日本語なら日本語で表示されます。

### 書きながら補完する

`![[`を書き始めるとファイル、`#`の後はシート、`|`の後は範囲、`?`や`&`の後はパラメータ、`=`の後は値の候補が出ます。候補が出ない場合は`Ctrl+Space`を押してください。

- **範囲の候補は、選んだシートにある表です。** 表題と見出しが説明に出るので、「遷移」と打てば「状態遷移表」の範囲に絞れます。シート全体の使用範囲も最後に出ます。
- **値の候補には日本語の説明が付きます**（`mode=`→`table`／`card`、`header=`→`first`／`none`など）。`columns=`では範囲内の列文字が見出し名付きで出ます。`A,`の後は残りの列だけが出ます。
- 候補を選ぶと、カーソル位置の値だけが置き換わります。後ろに続く指定や本文はそのままです。コードブロックの中では候補を出しません。

### 案内に沿って作る・直す

コマンドパレットで **`MMI: Create or Edit Embed`** を実行すると、ブック→シート→範囲→表示の指定→確認の順に選べます。キーボードだけで操作でき、各段の「戻る」ボタンで前に戻れます。Escで閉じれば文書は変わりません。この案内で出る文言は、VS Codeの表示言語に従います（日本語表示ならこの見出しのとおりの日本語、英語表示なら英語）。

- 確認の段では、実際の表示を先に確かめられます。「表として表示: 本体3行 × 3列（見出しあり）」「該当行0件」「別紙カード」「エラー: …」のいずれかです。
- 既存の`![[…]]`の上で実行する（またはホバーの「編集」、電球メニューの「この参照を編集…」を使う）と、今の値から始めます。変えた指定だけを書き換え、`x-`で始まる独自の指定や繰り返した`formatColumn`はそのまま残します。
- 挿入は1回の編集なので、Ctrl+Z 1回で元に戻ります。途中で文書が変わった場合は挿入を中止します。原本が変わった場合は表示を確かめ直します。

### 説明から表を探す

**`MMI: Find Table by Description`**（または上の案内の最初の段の「説明から探す…」）で、表を言葉で探せます。

```text
状態遷移表のIDと操作を見せて
リリース判定の表から要確認を含む行
設計.xlsxの画面一覧
```

- 入力に合わせて候補が更新されます。各候補には「対象: … / 列: … / 条件: 行のどこかに「要確認」を含む（部分一致）」の説明が付きます。選ぶと確認の段へ進み、表示を確かめてから挿入します。
- **表せない依頼は理由を示して断ります。** 集計（「担当者別に集計」）、比較（「1000以上」）、否定（「〜以外」）、並べ替え（「最新」）、特定の列の値での絞り込み（「判定列がNGの行」）は、MMI記法にない操作です。代わりに「「NG」を含む行」と書けば、行のどこかに含む行として探せます。
- 探す対象はワークスペース内のブックです。初回は索引を作るので進行表示が出ます（キャンセル可）。索引はVS Codeのメモリ上だけに持ち、ファイルには保存しません。2回目以降は変更のあったブックだけを読み直します。`MMI: Clear Table Search Index`でいつでも消去できます。
- 名前が一致する表が無いときは、名前の一部だけが合う表を「近いかもしれない表（名前は一致しません）」として別に示します。選ぶ前に説明と確認の表示で確かめてください。
- 自由な日本語をすべて理解するわけではありません。表・シート・ブックの名前と列名を含めると見つかりやすくなります。
- 方眼紙（1つの項目を複数のセルに結合して書く形式）の表には、結合した列ごとに1列で見せる`columns=`と、必要なら`mode=table`が付きます。補完の範囲候補や、案内に沿って作るときも同じ指定が出ます。

#### 実験的: ローカルの埋め込みモデルで言い換えを探す（既定はオフ）

表の名前に出ない言葉で説明したとき（「予行演習は何回やったか」→「リハーサル」の表）は、既定では見つかりません。必要な場合だけ、この端末で既に動いているローカルの埋め込みモデルを使って、意味の近さから表を推定できます。

OllamaまたはLM Studioを使っている場合は、runtimeを起動したうえでコマンドパレットから **`MMI: 端末内の意味検索モデルを選択（Ollama / LM Studio）`** を実行します。MMIが端末内で利用できる埋め込みモデルを調べ、選んだモデルを意味検索に設定します。MMI自身がモデルを取得したり、Ollamaのクラウドモデルを選んだり、モデルを勝手にloadしたりすることはありません。該当するモデルが無ければ、通常の検索設定は変わりません。

- 送るのはブック・シート・表題・見出しの**名前と依頼文だけ**です。セルの値は送りません。送り先は`localhost`・`127.0.0.1`・`::1`に限り、LANや外部サービスのendpointは拒否します。
- ほかの方式で見つからなかった依頼だけが対象です。名前や引用で表を指定した依頼、集計・並べ替えなどMMI記法で表せない依頼には使いません。
- 結果は「推定」で、類似度とモデル名が説明に付きます。誤ることがあり、選ぶまで何も挿入しません。runtimeが無い・モデルが無い・時間切れのときは、通常の検索だけが続きます。
- llama.cppなど、Ollama / LM Studio以外のOpenAI互換ローカルserverを使う場合は、従来どおり`markdownMatrixInjector.search.semantic.*`を手動設定できます。endpointはloopbackに限ります。
- `.minScore`はモデルごとに適切な値が違います。実運用で候補品質を判断する前に、`scripts/cpu-search-eval/semantic-eval.ts`で閾値ごとの再現率と誤受理を確認してください。

### 表の目録から選ぶ（試作）

エクスプローラーの**「MMI表の目録」**に、ワークスペースのブック→シート→表→列が並びます。Excelを開かずに、どこに何の表があるかを確かめられます。

- 表には範囲と行数が、Excelの「テーブル」として作られた表にはその名前が出ます。注意がある表（非表示の行がある、集計行を外した、など）には印が付きます。
- 表の右のボタンで参照を作ります。
  - **この表の参照を挿入**: 表全体を参照します。
  - **列と行を選んで挿入**: 列を見出しで選び、行を「すべて」「文字列を含む行」「先頭から指定した行数」から選びます。
- どちらも、表示を確かめてから挿入します。
- 「文字列を含む行」で列を指定すると、選んだ列だけの絞り込みと表示される行が一致するかを確かめます。MMIの`grep`は表示するどの列にも部分一致するため、一致しない場合は件数で知らせます。
- Excelの名前付き範囲とテーブルは名前で選べますが、参照にはA1範囲が書かれます。
- Excelで非表示の行・列も、MMIでは表示されます。

コマンドで同じことを行う方法（AIエージェントやCI向け）は、[AIエージェント向けの手引き](ai-agent-guide.md)を参照してください。

### 既存のExcel設計書を取り込む（試作）

**`MMI: Import from Workbook`**（日本語表示では「既存のExcel設計書から取り込み候補を作る」）を使うと、既存の設計書からMarkdownの下書きを作れます。エクスプローラーでブックを右クリックしても実行できます。

1. 取り込むブックを選びます。ワークスペース内の一覧にない場合は、別のExcelファイルを選べます。
2. 下書きの保存先を選びます（新しいMarkdownファイルです。ブックは変更しません）。
3. 選んだブックが下書きのワークスペース外にある場合は、Linked参照に使う原本コピーの保存先をワークスペース内で選びます。
4. MMIが表・画像・その他の領域を整理し、下書きとプレビューを開きます。

表と画像は性質に合わせて扱いを分けます。表は値をコピーせず、元ブックへ追従するMMI参照として置きます。.xlsx / .xlsmに埋め込まれた画像は通常の画像ファイルとして`assets/<ブック名>/`へ取り込み、元のシートごとにMarkdown画像参照を置きます。画像のoccurrenceはプロジェクトの`mmi-ledger.json`に記録します。同じ画像bytesが複数箇所にある場合、画像ファイルは共用しますが、各occurrenceは別に記録します。

Excelの入力規則にlistが設定されている場合は、選択肢も下書きに残します。セルに直接書かれた選択肢は値を表示します。同一ブック内の単純なA1範囲参照も、数式を評価せず、同じブックの保存済み表示値を読み取って選択肢を表示します。対象は単一行または単一列、最大10,000セルで、Excelの物理範囲内に限ります。外部ブック、名前定義、`INDIRECT`や`OFFSET`等の式、2次元範囲、上限外の範囲は値を推測せず、参照式だけを示します。この段階ではChoice listを別形式へ変換せず、レビュー対象として扱います。同じCandidateを却下または保留した判断が残っている場合、一括取り込みでも通常候補から外します。

- 下書きには、シートごとの見出し、表の参照、取り込んだ画像、表ではない領域（項目と値の組、文章、押印欄、図）の番地と扱いの目安が並びます。残す参照を選び、画像は必要な位置へ移動できます。不要な画像参照は下書きから削除できます。
- Markdownで扱えない画像や読み取れない画像は黙って捨てず、「画像・図形の注意」に理由を残します。AutoShapeとコネクタは原本から個別に読み、名前、図形内テキスト、preset geometry、セル上の位置を観測情報として下書きに残します。two-cell anchorで開始・終了セルが読める場合は「図形のsnapshot候補」に範囲も示します。one-cell/absolute anchorは終端セルを推測せず、範囲の確認を求めます。graphic frameにはグラフや図が含まれる場合があるため種類を断定せず、引き続き「画像・図形の注意」に残します。
- 方眼紙の表には`columns=A,C,I`のような指定が付きます。結合したセルの先頭の列だけを選んで、項目ごとに1列で見せるための指定です（列文字は範囲の先頭をAとして数えます）。表の幅が広いため`mode=table`も付きます。
- 見出しが2段の表、縦に結合したセル、表の途中の空行や区切り行、見出しの列に揃っていないセルがあると、下書きに**注意**が出ます。揃っていないセルの値は表示されないため、番地を示します。
- 「同じ書式」のシートと、近い書式との違い（「表『2. 画面項目』に列『初期値』があります」など）も示します。同じ書式のシートは同じ判断で取り込めます。
- 候補は推定です。表の範囲や見出しが違う場合は、参照を直すか削除してください。画像の抽出と台帳への記録は、表の役割推定を確定扱いにするものではありません。
- Candidateを後から確認する場合は、コマンド「MMI: 取り込み候補を確認」から表・画像・Choice list・AutoShape/コネクタ・JSON/YAML/XML/フラットテキストTreeを同じレビュー画面で扱えます。Shapeは観測内容の確認、却下、保留を扱います。two-cell anchorで開始・終了セルを安全に読めるShapeでは「この範囲を画像化」を選び、既存のregion-snapshotとしてPNGとprovenanceを作成できます。この操作はShape自体の採用ではありません。one-cell/absolute anchorでは終端セルを推測しないため、自動画像化を表示しません。Shapeそのものを別のExtracted資産へ変換する経路は、現時点ではありません。対応sourceはエクスプローラーの右クリックからも同じレビューを開始できます。Choice listは観測内容の確認、却下、保留を扱い、現時点では別のExtracted資産へ変換しません。Excel / CSVの親ID列やLevel列から階層を確認したい場合は「MMI: 表の列を指定して階層Candidateを確認」を使い、対象シートと列を明示します。通常レビューに階層推定の質問は追加されません。source、取込状態、type/status/executionの絞り込みはセッション中保持され、採用・却下・保留などの後は次のCandidateへ進みます。Escで終了するまで1件ごとに条件を選び直す必要はありません。表Candidateでは抽出Markdownを修正採用でき、画像Candidateでは画像bytesを変えずalt textを修正採用できます。Treeはレビューした構造位置のsubtreeをnested Markdownへ取り込みます。いずれも原本は変更しません。初回一括取り込みの既定では、表はLinkedのまま残します。

Candidateレビューの利用者観測を行う場合は、設定 `MMI › Review Observation: Enabled` を有効にします。レビューを閉じるたびに、開始・終了時刻、所要時間、選択して確認した候補数、採用・修正採用・却下・保留などの状態変化をローカルのJSONLへ記録します。Markdownを編集中にレビューを開始したかどうかも補助値として残しますが、この値だけで「執筆を中断した」とは判断しません。Candidateの本文やセル値は記録せず、外部にも送信しません。

### 参照を確かめる・直す

- **ホバー**: `![[…]]`にマウスを乗せると、実際の表示（表なら先頭5行）、行数・列数、カード表示かエラーかが出ます。「編集」「原本を開く」もここから選べます。
- **修正候補**: シート名やファイル名が見つからない参照には、電球メニューに「「Sheet1」に置き換える」のような候補が出ます。候補は実在するシート・ファイルだけで、名前の似ている順に並びます。置き換わるのは間違っている部分だけです。
- **列の挿入・削除によるずれ**: `mmi select`（またはその入力支援）で作った参照には`x-headers=操作,承認者`のように、書いたときの見出しが残ります。Excelで列を挿入・削除して参照が別の列を指すようになると、問題パネルと`mmi check`に「見出しが、参照を書いたときと違います」と警告が出ます（表示は変わらず、警告でも`check`は失敗になりません）。直すときは`columns=`を合わせ、期待値を更新します（警告の修正候補「見出しの期待値（x-headers）を現在の表に更新する」で書き換えられます。原本の変更が意図したものかは人が判断するため、既定の修正にはなりません）。「参照を作成・編集」で新しく作る参照にも、同じ見出しが記録されます（既存の参照は、確定だけでは変わりません）。この仕組みは記法の実験キーで、他の処理系は無視します（[記法仕様](spec/mmi-notation-v1.md)の付録）。
- **指定の打ち間違い**: `mode=tabel`のように使えない値は警告になり（表示では無視されます）、「「table」に置き換える」が出ます。`heder=first`のように既知の指定に似た名前は、無視される指定として情報表示し、`header`への置き換えを出します。`x-`で始まる独自の指定や、似ていない未知の指定は警告しません。

### Excelからコピーした範囲を参照にする

貼り付け・ドラッグ＆ドロップは、元アプリから渡される情報に依存します。Excelのセルをコピーしても元ファイルの場所が含まれない場合は、参照記法を作れません。
確実に始めるには、サンプルの記法をコピーして、パス・シート・範囲を置き換えてください。
`MMI: Insert Embed From Paste` / `MMI: Insert Embed From Drop` は互換用コマンドです。どんな貼り付けでもExcel参照へ変換できるわけではありません。

Excelのクリップボードにはコピー元情報が含まれる場合があります。ただし、VS Codeの貼り付けAPIからその情報を取得できるか、またコピー内容と元範囲が一致するかは別の問題です。通常のCtrl+Vで参照に変換されない場合は、次のいずれかを使ってください。

- **`Paste As...`（既定Ctrl+.、貼り付け直後にも切替ウィジェットから呼び出せます）**: 通常どおりCtrl+Vで貼り付けた直後、または貼り付け前にCtrl+.を押すと、VS Code標準の「貼り付け方法を選ぶ」ドロップダウンが表示されます。クリップボードの内容でワークスペース内のワークブックを検索し、一致する範囲が見つかればそこに選択肢として並びます。何も選ばなければ挿入されません。
- **コマンドパレットから `MMI: Insert Embed by Content Match` を実行**: 貼り付け操作を経由せず、クリップボードに今ある内容で同じ検索を行います。一致が見つかれば候補として提示します（1件でも必ず確認を求めます。何も選ばずEscで閉じれば挿入されません）。同じ値が複数の場所にある場合は、候補ごとに表題・見出し・直前と直後の行が出るので、それを見て選んでください。一致は内容から推定したもので、コピー元の証明ではありません。

**Windows（ローカル）では、コピー元をそのまま使えます。** Excelで範囲をコピーしてから上のどちらかを使うと、クリップボードに入っているコピー元（ブック・シート・セル範囲）を読み、保存済みの原本が同じ値を示すことを確かめたうえで「コピー元を確認済み」として先頭に示します。例えば`設計.xlsx`の`状態遷移`で`C5:F12`をコピーすると、`![[./data/設計.xlsx#状態遷移|C5:F12]]`が候補になります。次の場合は確認できないため、内容からの推定だけになります: ブックを保存していない・保存後に変更した、フィルターで行や列を隠してコピーした、ブックがワークスペースの外にある、リモート環境（WSL・SSHなど）で開いている。この機能は設定「MMI › Paste: Use Clipboard Source」でオフにできます。読んだクリップボードの内容は保存しません。

どちらも通常のCtrl+V自体の挙動は変えません（未確認の推測を自動的に本文へ入れることはありません）。ワークスペース内に候補となるワークブックが多い場合、検索に時間がかかることがあります。

## 納品一覧を作る

1. `08-release.md` の**ソース編集画面**を開きます。
2. `Ctrl+Shift+P` で `MMI: Generate Delivery Manifest` を実行します。
3. 同じフォルダーの `08-release.delivery-manifest.csv` を開きます。
4. `design.xlsx` と `applications-wide.csv` の2件を確認します。


![実機で生成した納品一覧](media/release-20260908/05-delivery-manifest.png)

対象は、この文書内でカード扱いになっている参照です。通常の表として表示したファイルは対象外です。
CSVにはファイルパス、シート、範囲、カード化の理由、表題、IDが出ます。
**元データのコピーやZIP化は行いません。** 一覧を見ながら、別紙を納品フォルダーへまとめます。
同名の一覧は再実行すると上書きされるため、手作業で追記した内容を残す場合は先に別名で保存してください。

## コマンドで使う

`mmi`コマンドは、VS Codeを開かずに参照の確認・展開・取り込みを行います。AIエージェントに設計書を書かせるとき、CIで参照を検証するときにも使えます。どのコマンドも元データは書き換えません。`extract`と`import`はassetsや取り込み台帳へ書き込み、`materialize`は指定した出力先へDetached用のMarkdownを書きます。

| コマンド | 内容 |
| --- | --- |
| `mmi schema candidate` | Semantic Candidateの公開JSON Schemaを出力する。契約名は`mmi.semantic-candidate/v1`。外部AI、CI、連携ツールがCandidateのkind、status、execution、method、Claim、provenance、fingerprint等を機械的に解釈するために使う。review stateはCandidate本体に含めない |
| `mmi inspect <正本>` | Excel / CSV等では表の範囲・見出し・行数を表示し、`.xlsx`では画像、list入力規則、AutoShape/コネクタも一覧に出す。AutoShape/コネクタは`shape` Candidateとして名前・テキスト・形状・位置を保持する。直接記述されたlistと、安全に解決できる同一ブックA1範囲参照は選択肢も表示する。AutoShape・コネクタ・graphic frameを含むdrawingでtwo-cell anchorが読める場合は、画像化に使える`snapshot hint`も表示する。one-cell/absolute anchorは終端セルを推測せず要確認とする。`.json`と安全subsetの`.yaml` / `.yml`ではobject / arrayをTree Candidateとして列挙し、RFC 6901 JSON Pointer、node type、直下child数を表示する。YAMLのanchor / alias / merge key / explicit tag / 非string key等は明示構造として解決せずエラーにする。`--json`では`candidateContract`に契約名を併記し、Candidateのstatus・method・provenance・fingerprintを確認できる。取り込み台帳がある場合は`imported / changed / stale / duplicate / unimported`を照合し、`--unimported`や`--exclude-imported`で絞り込める |
| `mmi extract <ブック.xlsx> --image <番号\|all>` | Excelに貼られた画像を`assets/`（`--out-dir`で変更）へ書き出し、Markdownの画像参照と出典を出力する。CLIでは同時に`<root>/mmi-ledger.json`へoccurrence・content fingerprint・出力先・変換条件・review basisを記録する（`--ledger`で変更）。同じ画像が別の場所にもある場合は別occurrenceとして残し、review stateを自動継承しない |
| `mmi snapshot <ブック.xlsx> --sheet <シート> --range <A1:B9>` | 図形やレイアウトに意味がある範囲をLibreOfficeで描画し、PNGと`mmi.region-snapshot/v1` sidecarを生成する。`mmi inspect`で範囲確定済みのdrawing `snapshot hint`が出た場合は、`--sheet` / `--range`の代わりに`--hint <番号>`を使える。VS CodeのCandidateレビューでも、two-cell anchorのShapeから同じregion-snapshot生成を呼べる。終端セルを安全に読めないhintやShapeは自動実行せず、明示rangeを求める。原本は保存しない |
| `mmi extract <file.json\|file.yaml> --tree <Pointer\|root>` | JSONまたは安全subset YAMLのobject / arrayから1つのTree Candidateを選び、nested listのMarkdown assetへ取り込む。`root`は文書全体、`/service/endpoints`のような値はRFC 6901 JSON Pointer。原本は変更しない。取り込み台帳にはpointer、subtree fingerprint、出力digest、Projection方式を記録する |
| `mmi import <ブック> --draft <下書き.md>` | 既存ブックを1回でモダナイズ用の下書きへ整理する。表は元ブックへ追従する参照のまま残し、.xlsx / .xlsmの埋込画像はcontent-addressedな画像ファイルとして取り込む。AutoShape/コネクタは変換せず、原本から読めた名前・テキスト・形状・位置を観測情報として下書きに残す。既存の却下・保留判断があるShapeは通常表示とshape由来のsnapshot候補から外す。Excelのlist入力規則も観測情報として下書きに残す。inline値と、安全に解決できる同一ブックA1範囲参照は選択肢を表示する。それ以外の参照式は評価せず、式を確認事項として残す。ワークスペース外の原本は`--copy-source <保存先>`でproject内へ同一bytesのsourceとして取り込める。表でない領域や、取り込めない画像・図形、読み切れない選択肢は確認事項として残す。注意があっても下書き作成に成功すれば終了コードは0で、JSONの`status`は`created-with-warnings`になる。下書き・sourceコピー・assets・台帳の書込先は`--root`内に限定し、既存ファイルを異なる内容で上書きしない |
| `mmi check <文書またはフォルダー>` | 参照の誤りを「問題」パネルと同じ診断コードで表示。誤りがあれば終了コード1 |
| `mmi render <文書>` | 参照を展開したMarkdownを出力。`--to html`でPDF変換用のHTML |
| `mmi materialize <文書> -o <出力.md>` | 原本を外すためのMarkdownを生成する。小表は本文へ、別紙相当表は`mmi-materialized/`へ、ローカル画像は`mmi-assets/`へcontent-addressedで実体化する。provenance付きで採用済みのExtracted表・画像・Treeは現在sourceとledgerへfreshness照合し、変更・stale・未追跡なら終了コード1 |
| `mmi detach-check <文書>` | Detached成果物にMMI参照、未実体化marker、旧「別紙」カード、壊れたローカルリンク、ワークスペース外へのローカルリンクが残っていないか検査する。問題があれば終了コード1 |
| `mmi manifest <文書>` | 別紙カードになる参照の一覧をCSVで出力 |
| `mmi handoff <正本> --task <依頼>` | Candidate・provenance・任意の文書診断から、外部LLMへ手渡すpromptをローカル生成する。`--json`で機械可読package、`--document`で文書診断を追加。既定ではClaim値を省略し、必要な場合だけ`--include-values`で明示的に含める。MMI自身は外部LLMへ送信しない |
| `mmi validate-proposal <MMI記法> --package <handoff.json> --document <文書>` | 外部LLMから戻ったMMI記法1件を、handoff時source・parser・parameter schema・workspace境界・sheet・read-only preview・source digestで再検証する。全検証通過時のみ終了コード0。結果を自動適用しない |
| `mmi validate-selection <proposal.json> --package <handoff.json>` | 外部LLMから戻ったCandidate選択案をhandoff時のCandidate identity allowlistで再検証する。成功しても`accepted-for-review`であり、Candidateのepistemic stateを変更しない |
| `mmi validate-transformation <proposal.json> --package <handoff.json> --document <文書>` | Linked / Extractedへの変換案をcurrent sourceからCandidateを再発見して検証する。Extractedは表の`gfm-table-v1`、画像の`raw-image-bytes-v1`、JSON/YAML/XML Treeの各nested-list、フラットテキストTreeの`flat-text-nested-list-v1`という既存経路だけをreview planとして返す。ShapeやChoice list等はCandidateを再確認したうえで、直接変換が未対応ならblockedにする。assetや文書、review stateは自動変更しない |

参照を検証する範囲（ワークスペース）は、実行したフォルダーです。`--root`で変えられます。`--json`を付けると機械可読な出力になります。

**外部LLMへのhandoffについて。** `mmi handoff`は判断材料をローカルに整形するだけで、ChatGPT等への送信、ログイン、API keyの利用、課金サービスへの自動fallbackは行いません。packageは「依頼」「observedの原本事実」「inferredの候補」「診断・abstainedの未解決事項」「許可/禁止操作」を分離します。採用・修正などのreview stateはCandidateの由来とは別に扱います。sourceと`--document`は`--root`内に限定されます。外部LLMから戻った内容は未検証の提案です。MMI記法は`validate-proposal`、Candidate選択案は`validate-selection`、Linked / Extractedへの変換案は`validate-transformation`で再検証します。変換案ではCandidateレビューと同じ目録生成器からcurrent Candidateを再発見し、source digestとprovenanceを再確認します。既存の変換経路がある種別だけreview planを返します。検証が通っても、文書・原本・asset・review stateを自動変更しません。推定Treeが`inferred`であることも変わりません。

**Detachedについて。** `materialize`は通常の`render`とは別の経路です。日常のLinked文書やプレビューを変えず、原本を廃止すると決めた範囲だけで使います。例えば `mmi materialize docs/spec.md -o detached/spec.md --root .` とすると、小さい表は通常のGFM表へ、大きくてカードになる表は `detached/mmi-materialized/table-<digest>.md` へ実体化されます。本文が参照するローカル画像は内容digestで `detached/mmi-assets/` へ複製され、Detached側の相対リンクへ書き換えられます。同じ画像bytesは1コピーにまとめます。`--assets-dir`で保存先を変更できます。

また、本文に`mmi:extracted` / `mmi:extracted-table` / `mmi:extracted-tree` provenanceがある場合、`materialize`は現在のsource Candidateと`mmi-ledger.json`を照合します。取り込み後に原本側の画像・表・採用したTree subtreeが変わった、review basisがstaleになった、ledgerが無い、といった場合は終了コード1となり、detach可能とは扱いません。Treeは採用したsubtreeのfingerprintで判定するため、同じsourceでも対象外の部分だけが変わった場合は採用を失効させません。原本に存在するだけで本文へ採用していないCandidateはblockerにしません。

生成後は`mmi detach-check detached/spec.md --root .`を実行します。これは成果物側にMMI参照、未実体化marker、壊れた/境界外ローカルリンクが残っていないことを確認します。つまり、**materialize時のfreshness preflight → 原本の除去 → detach-checkによるartifact closure**の二段階で確認します。JSON / YAML / XML / フラットテキスト / 表形式階層のTreeは、このfreshness preflightへ接続済みです。AutoShape/コネクタのSource Adapterは実装済みですが、Shape自体をExtracted資産へ変換する経路はまだないため、freshness preflightの対象にはしていません。

**取り込み台帳について。** 台帳は通常のJSONで、MMIを外しても読めます。セル位置や画像のanchorなどのoccurrence identityと、画像bytesや表内容のcontent fingerprintは分けて記録します。同じ画像bytesが別の場所にあっても、その場所を「取込済み」にはしません（`duplicate`）。同じ場所の内容が変わった場合は`changed`として再確認対象にします。内容fingerprintが同じでも、review時に根拠にしたClaim・evidence・methodが変わった場合は`stale`として示し、変わったClaim名を確認できます。別の場所へ移動した可能性があるCandidateは、同一content、同一sheet、object名、source-native object、近傍表などをlineage evidenceとして候補表示しますが、自動的に同一物とはみなしません。研究層の類似判定は完全一致・lineage evidenceとは別の証拠として扱います。`--json`ではCandidate自身が持つprovider別・scale別の値を`researchScores`として確認できます。別のoccurrenceとの比較結果は`--similarity-evidence <file>`で読み込んだsidecarから`similarityEvidence`として表示し、比較対象・provider/version・metric semanticsも一緒に保持します。異なるprovider/scale/namespaceの値を平均したり、scoreが高いという理由だけで`imported`・`duplicate`へ変更したり、`--unimported`から自動除外したりしません。

**Tree Candidateについて。** JSONのobject / array、YAMLの安全subsetに含まれるmapping / sequence、汎用XMLのelementは、原本に親子関係が明示されています。MMIはこの関係を推測し直さず、`observed + deterministic + M0`のTree Candidateとして扱います。YAMLはYAML 1.2かつJSON互換のデータモデルだけを対象にし、anchor / alias / merge key / explicit tag / 非string key / 非finite numberは拒否します。これらを展開・変換してから「原本に明示された構造」とみなすことはしません。XML Spreadsheet 2003は従来どおり表として扱い、汎用XMLのTree経路とは分けます。

`.txt`・`.text`・`.log`では、インデント、見出し番号、接頭辞コードから階層候補を作れます。これらは原本に親子関係が明示されていないため、結果は`inferred + deterministic + M1`です。deterministicであっても事実として確定した意味ではありません。既定では3方式を別々に評価し、異なる構造になった場合は統合しません。`inspect --json`の`treeHypotheses`と`treeAmbiguous`で確認できます。方式を限定するときは、たとえば`--tree-method heading-number`を使います。

```sh
mmi inspect docs/outline.txt --tree-method heading-number --json
mmi extract docs/outline.txt --tree text:heading-number:line:1 --out-dir assets
```

VS Codeの「取り込み候補を確認」でも、表・画像・Choice list・JSON/YAML/XML Treeと同じ画面でフラットテキストTreeを採用・却下・保留できます。Excel / CSVの階層は「表の列を指定して階層Candidateを確認」からシートと列を明示し、同じレビュー画面で扱います。親ID方式ではID列と親ID列、必要なら表示名列を選びます。Level方式ではLevel列と表示名列を選びます。どちらも親子関係は`inferred + deterministic + M1`のままで、採用しても原本に明示された事実へ昇格しません。レビューしたsubtreeを取り込むときは、現在のsourceから同じ方式でCandidateを作り直し、fingerprintが一致した場合だけnested Markdownへ書き出します。対象subtreeが変わっていれば採用しません。対象外のrootだけが変わり、選んだsubtreeの内容と構造が同じ場合は採用を妨げません。取り込み後のdetach freshnessも同じCandidateとledgerで確認します。フラットテキストはUTF-8だけを対象とし、解釈できないbytesはエラーにします。

**画像について。** Excelに画面ダンプなどを貼って設計を整理する書き方は、そのまま続けられます。`extract`は画像を取り出して参照できる形にするだけで、Excel側の画像は変わりません。Excelで画像を差し替えたり動かしたりしても、次に`inspect`を実行すれば現在の位置と内容が分かります。取り出せるのはPNG・JPEG・GIF・BMP・SVGです。EMF・WMF・TIFF、外部ファイルへのリンク、壊れた図形は、取り出さずに理由を表示します。`.xls`（旧形式）の画像は読めません。

配布CLIはNode.js 20以上で動くnpm互換tarballです。配布された`.tgz`を使う場合、MMIリポジトリのcheckout、TypeScript、`npm ci`、buildは不要です。Node 20未満で起動した場合は、本体依存を読み込む前に必要なNode版を表示して終了します。runtime依存もtarballへ同梱します。

```bash
npm install -g ./markdown-matrix-injector-<version>.tgz
mmi --help
mmi --version
mmi check ./basic-design --root ./basic-design
```

一時利用ではtarballをnpm package specとして指定できます。

```bash
npm exec --yes --package ./markdown-matrix-injector-<version>.tgz -- \
  mmi check ./basic-design --root ./basic-design
```

開発用checkoutで動かす場合だけ、従来どおり`03_Implement`でbuildして実行します。

```bash
cd 03_Implement
npm run build
npm run mmi -- check ../04_Documentation/kits/basic-design --root ../04_Documentation/kits/basic-design
```

配布tarballのWindows・Linux新規環境でのmanual-e2eはissue-0197で確認する。検証が完了するまでは、両OSで配布済み・検証済みとは扱いません。

AIエージェントに使わせる場合は、[AI向け指示](../skills/mmi/SKILL.md)を読ませ、[基本設計書キット](kits/basic-design/README.md)の依頼例から始めてください。

## PDFを作る

MMIはプレビュー用のHTMLとCSSを生成します。PDFへの変換は別の生成器を使います。
通常のMarkdown変換器だけでは`![[...]]`が展開されないので、**まずMMIで表を展開し、そのHTMLをPDFに変換**します。

確認用の [設計書PDF](samples/practical/10-print.pdf) は、縦・横・縦の3ページです。

![横向きページの状態遷移表](media/release-20260908/06-print-landscape.png)

開発環境を使える方は、リポジトリの`03_Implement`で実行します。

```bash
npm run mmi -- render ../04_Documentation/samples/practical/10-print.md --to html -o ../04_Documentation/samples/practical/10-print.html --root ../04_Documentation/samples/practical
weasyprint ../04_Documentation/samples/practical/10-print.html ../04_Documentation/samples/practical/10-print.pdf
```

拡張の開発依存、WeasyPrint、日本語フォントが導入済みであることが前提です。
今回の検証はWeasyPrint 69.0と游ゴシックで行いました。フォントがないと文字が四角になるため、用意してから再生成します。
WindowsのフォントをWSLから指定した手順は [検証記録](release-validation-2026-09-08.md) にあります。

`pageBreak=before`は表の前の改ページ、`orientation=landscape`は横向き、`portrait`は縦向きの指定です。
これらはプレビュー画面を紙のページに区切る機能ではありません。
別のPDF生成器を使う場合は表の展開・改ページ・用紙の向きまで確認してください。
VS Codeの「Markdown PDF」拡張からの直接出力は、今回の検証済み経路に含みません。

## 困ったとき

| 症状 | 確認すること |
|---|---|
| 記法がそのまま表示される | 拡張が有効か、更新後の再読み込みが済んだか、コード例の中ではないか |
| ファイルが見つからない | Markdown基準の相対パス、dataフォルダー、ワークスペース境界 |
| シートが見つからない | 全角・半角を含むシート名。CSVは`Sheet1` |
| XMLのエラーが出る | XML Spreadsheet 2003は表、その他のwell-formedなUTF-8 XMLはTree Candidateとして扱う。encoding宣言やnamespaceの不整合を確認する |
| YAMLのエラーが出る | YAML TreeはUTF-8・YAML 1.2のJSON互換subsetだけを扱う。anchor、alias、merge key、明示tag、非string key、`.inf` / `.nan`等がないか確認する |
| 検索すると0行になる | 列を絞った後にも検索対象が残るか。見出し行は検索対象外 |
| 列を減らしてもカードのまま | `mode=table`も指定したか |
| 外部アプリが開かない | ローカルの信頼済みワークスペースか、既定アプリがあるか |
| 原本を変更したのに表示が古い | 原本の保存後にプレビューを開き直したか |
| PDFだけ表が出ない | MMIで展開済みのHTMLから変換しているか |
| PDFの日本語が四角になる | PDF生成環境に日本語フォントがあるか |


問題の報告には、VS Code・MMIのバージョン、OS、最小の記法、期待した表示、実際の表示を添えてください。
同梱サンプルで再現できるか確認すると、業務データを送らずに切り分けできます。

## 対応範囲

表示対象はExcel（XLSX/XLS）、UTF-8（BOM有無）またはCP932のCSV、TSV、XML Spreadsheet 2003です。JSON、安全subsetのUTF-8 YAML、汎用XMLは明示Tree Candidate、UTF-8の`.txt`・`.text`・`.log`と、利用者が親列・Level列を明示したExcel / CSVは推定Tree Candidateとして`inspect`・`extract --tree`・VS Codeレビューの対象です。これらのTree CandidateはMMI記法で表を表示する経路とは別です。補完や貼り付けの対象形式は表示対象より狭い場合があります。
数式を再計算する機能ではなく、保存済みの値を使います。数式は元アプリで再計算・保存してから参照してください。
画像・図形・マクロ・Excelの詳細レイアウトは再現しません。

実機確認はWindowsのVS Code 1.136.1、PDFはWeasyPrint 69.0です。
最低対応バージョンでの全機能、macOS、リモート環境、各アプリからのネイティブなセル貼り付け・ドラッグ操作をすべて保証するものではありません。
結果と未確認事項は [検証記録](release-validation-2026-09-08.md) を参照してください。

## 関連資料

- [解説動画と画面一覧](media/release-20260908/README.md)
- [実務サンプル12本](samples/practical/README.md)
- [パラメータリファレンス](reference.md)
- [AIエージェント向けの手引き（試作）](ai-agent-guide.md)
- [MMI Notation v1](spec/mmi-notation-v1.md)
- [要件定義](../00_Prompt/requirements.md)

## 画面で確認する

![問題パネルに表示された3件](media/release-20260908/04-diagnostics.png)

別紙ボタンから初めて開く際に、VS Codeが拡張URIを開く許可を求める場合があります。MMIと対象ファイルであることを確認して「開く」を選びます。常に許可する設定へ変更する必要はありません。

![別紙から開いたExcel](media/release-20260908/07-excel-opened.png)

[納品一覧とシート補完の実操作動画](media/release-20260908/mmi-live-walkthrough.mp4)

### CSVの文字コード

ソースコードのCSV読込みはUTF-8を優先し、UTF-8として不正な場合はCP932を試します。UTF-8 BOM付きの不正データや、どちらでも解釈できないデータはエラーにします。UTF-16は対象外です。両方で有効なデータはUTF-8が選ばれるため、完全な自動判定ではありません。必要な場合は原本を残してUTF-8 BOM付きの別ファイルを用意してください。[CP932の例](samples/practical/13-cp932.md)。既配布VSIXには更新が必要です。
