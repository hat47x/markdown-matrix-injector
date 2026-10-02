# クリップボード観測ハーネス

Excel範囲貼り付け（[issue-0114](../../../01_Plans/issues/issue-0114-excel-range-paste.md)）の受入条件が要求する観測を再実行するための道具です。設計の根拠は[クリップボード出所と照合](../../../02_Architecture/input-assistance-paste-provenance.md)と[ソースモデル](../../../02_Architecture/input-assistance-source-model.md)にあります。

製品コードではありません。 ビルド・テスト・配布物に含めません。[設計レビュー](../../../01_Plans/input-assistance-design-review.md)のR2/R4に従い、ここでの解析方法をそのまま製品へ移植しないでください。

- HTMLは正規表現で走査しています。製品では構文解析し、コピー断片と外側の表の文脈を区別する必要があります。
- `Object Descriptor`は宣言されたオフセット（`dwSrcOfCopy`）から読んでいます。バッファ全体を文字列化して検索する方法は採っていません。製品でも同様にします。

## 前提

- Windows、Microsoft Excel（COM自動化が使えること）
- Windows PowerShell 5.1
- Node 20以上。未導入ならVS Code同梱の実行環境が使えます。

生成物はすべて`%TEMP%\mmi-clipboard-probe`（`MMI_PROBE_DIR`で変更可）に置かれ、リポジトリには`expected-cases.json`以外書き込みません。使用するデータは架空です。実業務のブックとクリップボードを採取に使わないでください。

`.ps1`はUTF-8 BOM付きで保存します。Windows PowerShell 5.1はBOMが無い`.ps1`をシステムANSIコードページとして読み、日本語リテラルが壊れます。

## 手順

```powershell
# 1. 架空ブックを作る（状態遷移=C5:F12開始・途中空行あり、重複、A1開始、縦結合）
powershell -ExecutionPolicy Bypass -File .\build-books.ps1

# 2. 13ケースの生バイトを採取する（Excelが起動し、クリップボードを上書きします）
powershell -ExecutionPolicy Bypass -File .\probe-raw.ps1

# 3. 観測表を再生成し、自己検査を通す
node .\summarize.cjs

# 4. 期待値と比較する（差分があれば非ゼロ終了）
node .\verify-cases.cjs
```

Node未導入の場合。

```powershell
$env:ELECTRON_RUN_AS_NODE=1
& "$env:LOCALAPPDATA\Programs\Microsoft VS Code\Code.exe" .\summarize.cjs
```

座標喪失の再現と計測。

```powershell
node .\repro-coords.cjs     # 現行実装の誤った矩形、案A〜Dの比較、規模別の時間
node .\repro-details.cjs    # 結合範囲、dateNFの実効範囲、CSVのtrim
```

VS Codeが受け取るMIMEの確認。2026-09-11にVS Code 1.137.0で実施済み。 結果は`text/plain`・`text/html`・`text/rtf`・`image/png`の4件のみで、出所形式は含まれない（詳細: [クリップボード出所と照合](../../../02_Architecture/input-assistance-paste-provenance.md)§2、[issue-0114](../../../01_Plans/issues/issue-0114-excel-range-paste.md)「Cの完了内容」）。最低対応版（1.96系）での再実行と実キー入力での比較は未実施のまま残る。

```powershell
powershell -ExecutionPolicy Bypass -File .\probe-vscode.ps1
```

`ext/`の観測用拡張を専用の`--user-data-dir` / `--extensions-dir`で読み込んだ隔離VS Codeを起動し、Excelでコピーしてから専用のpaste-target文書へ貼り付けを実行させ、`DataTransfer`のMIME一覧を記録します。キー入力の注入は行わないため、無関係なウィンドウへ貼り付ける事故は起きません。

合格条件は`provideDocumentPasteEdits`が呼ばれ、MIME一覧が記録されることです。 拡張のactivateや、貼り付けが成功したことだけでは結果になりません。呼ばれなかった場合は終了コード2で失敗し、その結果を「出所形式が存在しない」と記録してはいけません（レビューR5）。宣言している最低対応版（VS Code 1.96系）でも`MMI_PROBE_CODE_EXE`を指定して観測し、実際のCtrl+V操作とも比較してください。

**過去に踏んだ2つの落とし穴（2026-09-11に修正済み、再発防止のため記録）:**

- `ext/extension.js`の`pasteMimeTypes`にワイルドカード`'*'`を指定していた。VS Codeはこれを「任意のMIME型」と解釈せず、`provideDocumentPasteEdits`が一度も呼ばれなかった。この不具合により「出所形式が存在しない」という誤った結論に到達しかけた。 具体的なMIME文字列の列挙（公式サンプル`microsoft/vscode-extension-samples/document-paste`と同じ流儀）へ修正済み。`pasteMimeTypes`を編集する際は`'*'`を使わないこと。
- `probe-vscode.ps1`が`ConvertTo-Json | Out-File -Encoding utf8`で書く`trigger.json`にBOMが付き、拡張側の`JSON.parse`が失敗していた（Windows PowerShell 5.1に`utf8NoBOM`が無いため）。拡張側でBOM除去してから解析するよう修正済み。同様の書き出しを追加する場合は同じ問題に注意すること。

## 期待値の固定

`expected-cases.json`が唯一リポジトリへ入る成果物です。ケースID、復号済みの構造値、環境を持ちます。生バイトと絶対パスは含めません（プローブ配下のパスは`<PROBE>`へ置換）。

```powershell
node .\verify-cases.cjs --update   # 現在の採取結果で期待値を作り直す
```

差分が出ても即座に不具合とは限りません。Excelの版、ホストのANSIコードページ、ブックが変われば正当に変わります。原因を確認してから`--update`してください。

記録しているハッシュは同一環境での再取得検知用です。採取バイトには絶対パス（`SourceURL`）が埋まるため、機器が変われば必ず変わります。機器間の一致判定には使えません。

レビュー時の独立再検証の記録は[review-evidence.json](../../../01_Plans/research/input-assistance-review-evidence.json)にあります。その`scriptHashes`はR1〜R5修正前のスクリプトを指します。 現在のスクリプトとは一致しません。

## 自己検査

`summarize.cjs`は表の前に自己検査を出力します。

- レビューR2の反例（1行目`A(rowspan=2), B` / 2行目`C, D`）が2×3と数えられること。行ごとのセル数の最大値では2列と誤るため、占有グリッドの回帰検査です。
- `C3:C4`（列全体）、`R5:R7`（行全体）、範囲外・逆順の住所をA1へ変換せず`null`を返すこと。

## 既知の制約

| 事象 | 対処 |
| --- | --- |
| `Code is currently being updated` | VS Codeに保留中の更新があると2つ目のインスタンスを起動できません。VS Codeを再起動して更新を完了させてから再実行します |
| `OpenClipboard failed err=5` | 他プロセスがクリップボードを保持しています。数分続くことがあります。`probe-raw.ps1`は再試行してから諦め、`NOTHING CAPTURED`と表示します |
| `Csv`や`Link`が文字化けする | .NETの`DataObject`文字列変換は形式ごとの符号化を誤ります。生バイトを`summarize.cjs`で復号してください |

`probe-lib.cjs`は`Link`をShift_JISとして復号します。日本語以外のANSIコードページの環境では、そのコードページに合わせて変更してください。
