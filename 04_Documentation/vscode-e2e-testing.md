# VSCode Engine E2E Testing Guide

## Purpose and scope
この文書は、issue-0010 の文書面の責務を次の 2 点に固定して整理するためのガイドです。

1. **native provider 非対応 host における command fallback 方針を明示すること**
2. **manual E2E の再現性を確保すること**

したがって本書では、Phase 5 E2E を次の 3 分類で切り分けて扱います。

- **Automated**: Extension Host API レベルで自動確認できる事実。
- **Manual**: Preview / Problems / OS ネイティブ paste / drag-and-drop など、実機操作で最終確認すべき事実。
- **Known unstable**: 現時点で既知の不安定要因。失敗しても、直ちに Paste / D&D 不具合と断定してはいけない事象。

## Overview
Markdown Matrix Injector では、Docker コンテナ内でも VSCode Extension Host を起動した自動検証を行えます。現在の Phase 5 E2E では、実際の VSCode エンジン上で次の 5 系統を確認します。

- `markdownMatrixInjector.renderEmbedForTest` による HTML 生成。
- Markdown 補完 (`![[` → filepath / `#` → sheet / `?` → query parameter)。
- Problems パネル相当の Diagnostics 生成（file not found / invalid XML / sheet not found）。
- Paste / D&D の **command fallback** による Markdown 挿入。
- **native paste / native drop provider** が利用可能な host 上で、DataTransfer adapter が embed 記法を返せること。

ただし、自動 E2E は **Extension Host API レベル** の事実確認に留まります。次の項目は manual E2E で補完してください。

- Markdown Preview / Webview DOM 上で、実際に `table` / card / error UI が見えているか。
- Problems パネル UI に、診断コード・メッセージ・対象行が期待どおり並ぶか。
- 補完 UI が編集中のカーソル位置に追随し、候補のラベルや絞り込みが違和感なく見えるか。
- Paste / D&D がネイティブ OS イベント経由でも実運用どおりに挿入されるか。
- native provider 対応 host と非対応 host で、どちらの入口が使われたか。

## Prerequisites
- Node.js / npm
- `xvfb-run` (`sudo apt-get install -y xvfb` など)
- Electron が利用する基本ライブラリ群
- `npm install` 済みであること

## Commands
```bash
cd 03_Implement
npm run build
npm run test:e2e
```

## What `npm run test:e2e` does
1. `npm run build` で Extension Host 用のテストバンドルを生成する。
2. `scripts/run-vscode-e2e.sh` が `xvfb-run` の有無を確認し、仮想ディスプレイ上で `test/e2e/runTest.ts` を起動する。
3. `runTest.ts` が fixture workspace を一時ディレクトリへ複製し、Diagnostics 用の `invalid.xml` を追加する。
4. `@vscode/test-electron` が VSCode を取得し、開発中の拡張を読み込んだ Extension Host を立ち上げる。
5. `test/e2e/suite/extensionHost.test.ts` が render / 補完 / Diagnostics / command fallback / native provider adapter の通し確認を実行する。

## Automated coverage: what the current E2E actually proves
### Assertions covered by automation
- `renderEmbedForTest` が table/card の既存レンダリングを返す。
- `vscode.executeCompletionItemProvider` 経由で filepath / sheet / query parameter の候補が取得できる。
- Markdown 文書上で `MMI_FILE_NOT_FOUND`, `MMI_INVALID_XML`, `MMI_SHEET_NOT_FOUND` が Diagnostics として取得できる。
- `markdownMatrixInjector.insertEmbedFromPaste` / `markdownMatrixInjector.insertEmbedFromDrop` が、native provider 非対応 host でも利用できる **command fallback** として embed 記法を挿入できる。
- `markdownMatrixInjector.__test.getPasteInsertTextFromDataTransfer` / `markdownMatrixInjector.__test.getDropInsertTextFromDataTransfer` が、native provider と同じ DataTransfer 解析結果を返す。
- 実行中 host が `registerDocumentPasteEditProvider` / `registerDocumentDropEditProvider` を公開している場合、その API surface が存在することを確認する。

### What automation does not prove
自動 E2E が直接保証しない事項は、次のとおりです。

- Preview / Webview DOM の見た目や崩れ。
- Problems ビューの配置、視認性、クリック遷移の体験。
- Suggest widget の表示位置や操作感。
- OS ネイティブの clipboard event / drop event から editor edit までの最終経路。
- host ごとに native path が本当に選択されたかどうかの UX レベルの観察結果。

## Native provider and fallback policy
この節が、issue-0010 に対する文書上の正本です。Paste / D&D の責務を **native path** と **fallback path** に分けて解釈してください。

### Native path: canonical entry point
- 正規入口は VSCode の native provider API です。
  - `registerDocumentPasteEditProvider`
  - `registerDocumentDropEditProvider`
- native provider 対応 host では、Paste は通常の `Ctrl+V` / `Cmd+V`、D&D は通常のドラッグ&ドロップを第一観測対象とします。
- 自動 E2E は provider の edit 適用までを直接再現するのではなく、provider が再利用する DataTransfer 解析ロジックを `__test.getPasteInsertTextFromDataTransfer` / `__test.getDropInsertTextFromDataTransfer` 経由で検証します。
- したがって自動 E2E が保証するのは、**「native provider が依存する解析ロジックは正しい」** こと、および **「host が provider API を持っているか確認できる」** ことまでです。

### Fallback path: explicit command fallback for unsupported hosts
- `markdownMatrixInjector.insertEmbedFromPaste` と `markdownMatrixInjector.insertEmbedFromDrop` は、**native provider 非対応 host 向けの明示的 fallback** として維持されます。
- fallback command は native provider と同じ解析ロジックを再利用します。HTML clipboard 解析や dropped file 解析を二重実装するものではありません。
- そのため、**fallback command が成功し native path だけ失敗する** 場合は、まず host capability / OS event / DataTransfer payload の差を疑ってください。
- 逆に、**native path と fallback path の両方が失敗する** 場合は、provider 登録可否ではなく解析ロジックまたは入力データ自体の問題を優先的に疑います。

### Practical boundary: what next agents should conclude
- **Automated で Pass**: 解析ロジックと fallback command は少なくとも Extension Host レベルで成立している。
- **Manual native path で Fail / fallback で Pass**: native provider 非対応 host、または host 依存制約の可能性が高い。
- **Manual native path で Fail / fallback でも Fail**: command fallback を含む共通処理の問題として扱う。
- **Autocomplete のみ Fail**: Paste / D&D と同一原因とみなさず、known unstable の節で別トラック管理する。

## Stream A integration points reflected in E2E
- Activation: `onLanguage:markdown` と各 command activation を前提に、Markdown 文書を開いて Extension Host を有効化する。
- Commands:
  - `markdownMatrixInjector.renderEmbedForTest`
  - `markdownMatrixInjector.insertEmbedFromPaste`
  - `markdownMatrixInjector.insertEmbedFromDrop`
- Manual reproduction path:
  1. Markdown ファイルを開く。
  2. `![[` を入力して補完候補を確認する。
  3. 存在しないファイル / シート / invalid XML を書いて Problems を確認する。
  4. native paste / drop を試し、その後に比較対象として Paste / Drop 入口コマンドを実行する。

## Manual E2E structure
以下は **自動 E2E の対象外だが、実運用では重要** な確認項目です。次エージェントが文書だけで再現できるよう、先に境界を固定します。

### Manual E2E sections
| Section | Classification | Primary purpose |
|---|---|---|
| Checklist A | Manual | Preview DOM と error UI を確認する。 |
| Checklist B | Manual | Problems パネルの視認性と行ジャンプを確認する。 |
| Checklist C | Manual | autocomplete UI と挿入結果を確認する。 |
| Checklist D | Manual | native paste と fallback paste command を比較する。 |
| Checklist E | Manual | native drop と fallback drop command を比較する。 |
| Known unstable | Known unstable | autocomplete の既知不安定要因を Paste / D&D から分離する。 |

### Why manual E2E is still required
| 系統 | 自動 E2E で足りない理由 | 手動で見るもの |
|---|---|---|
| Preview DOM | Extension Host テストは Preview/Webview の DOM を直接取得しないため。 | 表・カード・エラー表示が Preview 上で崩れず描画されること。 |
| Problems パネル | 自動 E2E は `languages.getDiagnostics` の内容しか見ておらず、Problems ビューの並び・視認性は未確認のため。 | エラー行、メッセージ、診断コードの見え方。 |
| Autocomplete | API では候補集合を取れるが、候補ウィジェットの表示位置・絞り込み・操作感は未確認のため。 | サジェストポップアップの内容、選択後の挿入結果。 |
| Paste / D&D | 自動 E2E は native provider の DataTransfer 解析と command fallback の両方を見ているが、OS ネイティブ paste / drag-and-drop event 自体は再現していないため。 | 実際の Ctrl/Cmd+V とファイル D&D での挿入結果、どの入口が選ばれたか。 |

## Manual environment setup
1. ホスト OS の VSCode でリポジトリ `/workspace/markdown-matrix-injector` を開く。
2. ターミナルで `cd 03_Implement && npm install && npm run build` を実行し、拡張のビルドを最新化する。
3. VSCode で `03_Implement` フォルダを基準に `.vscode/launch.json` の `Run Extension` 構成を選び、`F5` で Extension Development Host を起動する。
4. Development Host 側で `File > Open Folder...` から `03_Implement/test/fixtures/workspace` を開く。
5. Explorer に `docs/phase5-preview-manual.md` が無ければ新規作成し、以下の確認用 Markdown を貼り付けて保存する。

```md
# Phase 5 manual verification

## Preview targets

Valid table:
![[data/sample.csv#Sheet1|A1:B3?header=first]]

Missing file:
![[data/missing.csv#Sheet1|A1:B2]]

Missing sheet:
![[data/sample.csv#Unknown|A1:B2]]

Invalid xml:
![[data/invalid.xml#Sheet1|A1:B2]]
```

> `data/invalid.xml` が fixture に存在しない場合は、同じ `data/` 配下へ名前だけ先に作成し、Excel XML ではない適当な XML 文字列を保存してください。目的は Problems/Preview の invalid XML 経路を手動確認することです。

## Checklist A: Markdown Preview / Preview DOM
**Classification**: Manual  
**目的**: Preview DOM は自動 E2E 未対象なので、Preview 上の見た目とエラー表示を確認する。

### Steps
1. エディタで `phase5-preview-manual.md` を開き、`Markdown: Open Preview to the Side` を実行する。
2. `Valid table` セクションで、表が 2 列以上の HTML table として表示されることを確認する。
3. `Missing file` / `Missing sheet` / `Invalid xml` の各セクションで、壊れた空白ではなく、埋め込み失敗が分かるエラー表示または代替 UI が描画されることを確認する。
4. Preview をスクロールし、表やエラー UI が極端に重ならないこと、Markdown 見出しとの順序が崩れないことを確認する。

### Expected results
- `Valid table` は、少なくとも 1 行以上のデータを含む表として視認できる。
- エラー系 3 件は Preview 上で「何が壊れたか分からない空白」ではなく、失敗が分かる表示になる。
- Preview とエディタ本文の順序が一致し、対象 embed の前後が入れ替わらない。

### Failure hints
- Preview が更新されない場合は Markdown ファイル保存後に `Developer: Reload Window` を試す。
- 全 embed が素のテキストのままなら、Development Host 側で拡張が有効になっているか確認する。
- `invalid.xml` だけ無反応の場合は、手動作成した XML が fixture に保存されているか確認する。

## Checklist B: Problems パネル / Diagnostics visibility
**Classification**: Manual  
**目的**: Diagnostics 自体は自動化済みだが、Problems パネルの視認性・対象行・コード確認は手動で行う。

### Steps
1. `phase5-preview-manual.md` を保存した状態で、`View: Problems` を開く。
2. フィルタを解除し、`phase5-preview-manual.md` に紐づく問題だけを確認する。
3. 次の 3 件が Error として表示されることを確認する。
   - file not found
   - invalid XML
   - sheet not found
4. 各項目をクリックし、エディタカーソルが該当 embed 行へジャンプすることを確認する。
5. 可能なら Problems の詳細表示または Hover で、診断コードが `MMI_FILE_NOT_FOUND` / `MMI_INVALID_XML` / `MMI_SHEET_NOT_FOUND` と読み取れることを確認する。

### Expected results
- Problems パネルに 3 件だけ並び、保存のたびに重複して増殖しない。
- 各問題が該当 embed の行へナビゲートできる。
- メッセージだけでなく、どの種別の壊れ方か判別できる表示になっている。

### Failure hints
- Problems が 0 件なら Markdown ファイルとして開いているか、保存済みかを確認する。
- 件数が増え続ける場合は DiagnosticCollection の消し込み不全を疑い、再読み込み後も再現するか記録する。
- 行ジャンプがずれる場合は embed 記法の範囲計算ずれとして、実際に飛んだ行番号を記録する。

## Checklist C: Autocomplete UI
**Classification**: Manual / Known unstable-aware  
**目的**: 補完候補の中身だけでなく、補完ウィジェットの見え方と挿入後の本文変化を確認する。

### Steps
1. `phase5-preview-manual.md` の末尾に新しい行を作る。
2. `![[` と入力し、必要なら `Ctrl+Space` / `Cmd+Space` で補完を開く。
3. filepath 候補に `data/sample.csv` など workspace 内パス候補が出ることを確認する。
4. 候補を 1 件選択し、挿入後に `#` を入力する。
5. sheet/range 候補が続けて表示されることを確認し、1 件選択する。
6. 続けて `?` を入力し、`header=`, `mode=`, `columns=` など query parameter 候補が表示されることを確認する。
7. 補完を 1 つ確定し、最終的に `![[...#...?...]]` の形で本文へ挿入されることを確認する。

### Expected results
- `![[` 直後は filepath 候補、`#` 直後は sheet/range 候補、`?` 直後は query 候補と、段階的に切り替わる。
- 候補選択後、既存文字列を壊さず embed 記法の続きを自然に入力できる。
- 補完 UI がカーソル近傍に表示され、候補 0 件なのに無言で閉じるような違和感がない。

### Failure hints
- 補完が出ない場合は言語モードが Markdown か、カーソルが `![[`, `#`, `?` の直後かを確認する。
- filepath 候補だけ出る場合は fixture workspace を開いているか確認する。
- 候補確定後に括弧が壊れる場合は、どのトリガー文字で崩れたかを記録する。
- `#` 直後の sheet 候補だけが 0 件でも、Paste / D&D 回りの失敗とは混同しない。known unstable の節へ分離して記録する。

## Checklist D: Paste comparison (native paste vs fallback paste)
**Classification**: Manual  
**目的**: native paste provider の経路と fallback command の経路を比較し、どちらが利用されたか誤解なく記録する。

### Steps
1. OS 上で Excel / Google Sheets / 表計算ソフト、または HTML table をコピーできるブラウザを準備する。
2. その表をコピーし、Development Host の Markdown エディタへ戻る。
3. 新しい行で `Ctrl+V` / `Cmd+V` を実行する。
4. 通常の貼り付けだけで挙動を確認し、native paste が働いたかを観察する。
5. 直後に同じ入力条件で `markdownMatrixInjector.insertEmbedFromPaste` を実行し、fallback path の結果を比較する。
6. 必要なら `Editor: Paste As...` のような VSCode 側 UI も併記し、どの入口を使ったかを明示する。

### Expected results
- native provider 対応 host では、通常の貼り付け操作だけでベストエフォートの `![[...]]` 形式 embed またはそれに準ずる提案結果が挿入される。
- native provider 非対応 host では、通常貼り付けで変換されない代わりに `markdownMatrixInjector.insertEmbedFromPaste` を使って同等の embed を再現できる。
- 挿入直後に Markdown が壊れず、少なくとも 1 行の有効な embed 記法として残る。
- 期待どおりの変換ができない場合も、無言失敗ではなく「何も変換されなかった」事実を記録できる。

### How to read failures
- **native paste Fail / fallback paste Pass**: native provider 未対応 host、または host 側制約を優先的に疑う。
- **native paste Fail / fallback paste Fail**: 共通解析ロジックまたは入力元 HTML metadata を疑う。
- **native paste Pass / fallback 未実行**: 記録不足。比較対象として fallback も少なくとも 1 回は実行する。

### Failure hints
- OS/ブラウザ差で clipboard HTML が取得できないことがあるため、利用したアプリ名と OS を必ず記録する。
- 通常貼り付けで何も起きない場合は、host が native paste provider 非対応か、clipboard の HTML メタデータが不足しているかを切り分ける。
- fallback command では成功する場合、native provider 未対応または host 側制約の可能性が高い。
- 文字化けや複数行崩れがあれば、貼り付け前後の本文差分を残す。

## Checklist E: Drag & Drop comparison (native drop vs fallback drop)
**Classification**: Manual  
**目的**: native drop provider と fallback drop command の差分を同じ入力条件で確認する。

### Steps
1. ホスト OS のファイルマネージャ、または Development Host の Explorer から `sample.csv` 等をつかめる状態にする。
2. Markdown エディタ上の空行へ CSV / XLSX / XML ファイルを通常ドロップする。
3. 挿入結果を確認したら、比較のため `markdownMatrixInjector.insertEmbedFromDrop` も実行する。
4. 複数ファイルを同時にドロップできる環境なら、単一ファイル時との差も確認する。

### Expected results
- native drop provider 対応 host では、少なくとも単一ファイルのドロップで `![[...]]` 記法が 1 つ挿入される。
- native provider 非対応 host では、`markdownMatrixInjector.insertEmbedFromDrop` 実行で同等の挿入結果を再現できる。
- 挿入パスが絶対/相対のどちらになったかを確認し、次エージェントが再現できるよう記録できる。
- 未対応形式や複数ドロップ時は、落ちるのではなく「未変換」または既知制約として扱える。

### How to read failures
- **native drop Fail / fallback drop Pass**: native drop provider 未対応 host、または host 側 drop event 制約を優先的に疑う。
- **native drop Fail / fallback drop Fail**: dropped file 解析か入力 payload を優先的に疑う。
- **native drop Pass / fallback 未実行**: 比較記録としては不十分。fallback も最低 1 回実行する。

### Failure hints
- 通常ドロップで本文無変化なら、host が native drop provider 非対応か、VSCode 標準のファイル挿入と競合していないか確認する。
- fallback command では成功する場合、native drop provider 未対応または host 側制約として記録する。
- Development Host とホスト VSCode で挙動差がある場合は、どちらで再現したか明記する。
- 複数ファイル時に一部だけ入る場合は、順序と実際に入ったパスを記録する。

## Known unstable: autocomplete must be tracked separately
**Classification**: Known unstable

- headless VSCode 1.112 系では、`vscode.executeCompletionItemProvider` による sheet 候補取得が 0 件になることがあります。
- 既存 assertion `Expected sheet completion after #.` は、この既知不安定要因の影響を受ける場合があります。
- 現行テストは 200ms 間隔・最大 15 回の再試行に加え、最終的な completion state (`vscodeVersion`, `platform`, `DISPLAY`, `lineText`, `position`, `attempts`, `labels`) を警告ログへ残します。
- 切り分けの観点は次のとおりです。
  - filepath 補完と query parameter 補完が同一実行で成功しているか。
  - `#` 直後だけ labels が document words に寄るか / 空になるか。
- 後者なら、cursor position や trigger character の全面故障ではなく、sheet metadata 読み出しまたは headless host の suggest 挙動差を優先的に疑ってください。
- この不安定要因は issue-0010 の native provider 変更とは独立に残っているため、**autocomplete の失敗を Paste / D&D の失敗と混同しない** ことが重要です。

## Reproduction and failure isolation workflow
Paste / D&D の不具合を切り分けるときは、必ず次の順番で確認してください。

1. **Host capability を記録する**
   - Development Host の `Developer: Toggle Developer Tools` や Extension Host のログで、利用中 VSCode version を記録する。
   - `registerDocumentPasteEditProvider` / `registerDocumentDropEditProvider` が存在する前提の host か、fallback only host かを最初にメモする。
2. **command fallback を先に成立させる**
   - `markdownMatrixInjector.insertEmbedFromPaste` または `markdownMatrixInjector.insertEmbedFromDrop` をコマンドパレットから実行し、同じ入力ソースで embed が入るかを見る。
   - ここが失敗する場合は native provider ではなく、解析ロジック全体または入力データの問題として扱う。
3. **native path を確認する**
   - Paste は `Ctrl+V` / `Cmd+V`、Drop は通常のドラッグ&ドロップで挿入を試す。
   - native path だけ失敗する場合、host capability・OS・入力元アプリ・DataTransfer payload 種別を記録する。
4. **autocomplete 失敗は別トラックに分離する**
   - `Expected sheet completion after #.` 相当の失敗は、Paste / D&D 回りと同一原因とみなさない。
   - 同一実行で併発しても、ログ上は autocomplete と paste/drop を別項目に分ける。

## Recommended checklist summary
実地確認時は、少なくとも次の順番でチェックしてください。

- [ ] Manual setup が完了している。
- [ ] Checklist A: Preview DOM を確認した。
- [ ] Checklist B: Problems パネルを確認した。
- [ ] Checklist C: autocomplete を確認した。
- [ ] Checklist D: **native paste** を確認した。
- [ ] Checklist D: **fallback paste command** を比較実行した。
- [ ] Checklist E: **native drop** を確認した。
- [ ] Checklist E: **fallback drop command** を比較実行した。
- [ ] Host capability を記録した。
- [ ] autocomplete の失敗有無を Paste / D&D と分離して記録した。

## Suggested manual result log template
手動確認の結果は、次のテンプレートで残すと差分を追いやすくなります。

### Summary table
| Date | VSCode version | OS | Host capability | Checklist | Result | Notes |
|---|---|---|---|---|---|---|
| YYYY-MM-DD | 1.xx | Ubuntu/macOS/Windows | native paste/drop available or fallback only | Preview DOM | Pass/Fail | 例: invalid XML は赤枠表示 |
| YYYY-MM-DD | 1.xx | Ubuntu/macOS/Windows | native paste/drop available or fallback only | Problems | Pass/Fail | 例: 3 件表示、行ジャンプ正常 |
| YYYY-MM-DD | 1.xx | Ubuntu/macOS/Windows | native paste/drop available or fallback only | Autocomplete | Pass/Fail | 例: `?` で `header=` 候補あり / `#` で sheet 0件 |
| YYYY-MM-DD | 1.xx | Ubuntu/macOS/Windows | native paste/drop available or fallback only | Paste | Pass/Fail | 例: native paste は無変化だが fallback 成功 |
| YYYY-MM-DD | 1.xx | Ubuntu/macOS/Windows | native paste/drop available or fallback only | D&D | Pass/Fail | 例: 単一 CSV は native 成功、複数 drop は未変換 |

### Detailed log template
```md
## Manual E2E log
- Date:
- VSCode version:
- OS:
- Workspace:
- Host capability:
  - registerDocumentPasteEditProvider: available / unavailable / unconfirmed
  - registerDocumentDropEditProvider: available / unavailable / unconfirmed

### Preview DOM
- Result:
- Notes:

### Problems
- Result:
- Notes:

### Autocomplete
- Result:
- Notes:
- Known unstable involved?: yes / no

### Paste
- Input source app:
- Native paste result:
- Fallback command result:
- Notes:

### D&D
- Input source:
- Native drop result:
- Fallback command result:
- Notes:
```

## Future Playwright candidates
手動でしか確認しにくい項目のうち、将来 Playwright 化を検討する候補は次のとおりです。

1. Markdown Preview の `table`, `figcaption`, `mmi-card`, error UI の DOM 存在確認。
2. Problems パネルの件数表示、対象ファイル表示、クリック遷移のスモークテスト。
3. Suggest widget の表示有無までは UI Automation で確認し、候補中身は既存 API テストを流用する。
4. Native paste/drop は OS 依存が強いため、現行自動化は DataTransfer adapter と fallback command までを保証し、OS イベントからの最終挿入は manual E2E で確認する。

## Failure triage
- `xvfb-run is required ...` で失敗した場合: OS パッケージ `xvfb` を導入する。
- VSCode ダウンロードや Electron 起動で失敗した場合: ネットワーク制約または GUI 依存ライブラリ不足を疑う。
- Completion が 0 件の場合: 対象文書が Markdown として開かれているか、カーソル位置が `![[`, `#`, `?` の直後かを確認する。特に `#` 直後の sheet 候補 0 件は、headless VSCode 1.112 系の既知不安定要因として別記録に切り出す。E2E ログには `vscodeVersion`, `platform`, `DISPLAY`, `lineText`, `position`, `attempts`, `labels` を JSON で出すようにしてあるため、まず filepath / query parameter 補完が同一実行で生きているかを見て、sheet 段だけが欠落しているかを判定する。
- Diagnostics が不足する場合: 一時 workspace の `data/invalid.xml` 作成と、対象 Markdown 文書保存内容を確認する。
- Paste / D&D 挿入が失敗する場合: まず native path 失敗か fallback command 失敗かを分離する。native path だけ失敗するなら host capability / OS event / clipboard or drop payload を確認し、fallback も失敗するなら解析ロジック側を疑う。

## Known scope limits
- この E2E は Extension Host API レベルの検証であり、Markdown Preview / Webview の DOM までは検査しません。
- native provider の edit 適用は host capability と OS イベントに依存するため、最終挿入結果は manual E2E で補完する必要があります。

## issue-0010 acceptance criteria coverage from documentation
本書が issue-0010 の acceptance criteria を文書面で補完する範囲は次のとおりです。

- **「native provider が使えない環境では、command ベースのフォールバック方針がコードまたはドキュメントで明示されていること」**
  - 本書の `Native provider and fallback policy` 節で、native path と fallback path の責務、および失敗時の読み方を明示しました。
- **「unit / E2E の双方で退行がないこと」への運用補助**
  - 自動 E2E が何を証明し、何を証明しないかを分離し、manual E2E で補完すべき観点をチェックリスト化しました。
- **Task breakdown の「Extension Host E2E と運用ドキュメントを更新する」**
  - manual E2E の再現手順、比較観点、失敗時の見方、結果ログテンプレートを改善し、次エージェントが native provider / fallback / autocomplete known unstable を混同しないよう整理しました。
