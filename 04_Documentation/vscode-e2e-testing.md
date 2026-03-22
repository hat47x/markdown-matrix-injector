# VSCode Engine E2E Testing Guide

## Purpose and scope
この文書は、issue-0010 の未完了条件に対して **manual E2E の運用正本** として使うものです。ここで扱う範囲は次の 3 点に限定します。

1. **再現手順**: 次エージェントが同じ host class / 同じ入力条件で manual E2E をやり直せること。
2. **観測順**: host class ごとの first move、native path / fallback path の比較順、manual と automation の handoff を固定すること。
3. **failure triage**: native path・fallback path・Known unstable を混線させずに切り分けること。

本書で扱わないこと:
- architecture / API 責務の再定義
- 実装変更やテストコード変更
- Paste / D&D と無関係な一般論としての VSCode UX 論評

Phase 5 E2E は運用上、次の 3 分類で読み分けます。

- **Automated**: Extension Host API レベルで自動確認できる事実。
- **Manual**: Preview / Problems / OS ネイティブ paste / drag-and-drop など、実機操作で最終確認すべき事実。
- **Known unstable**: 既知の不安定要因。失敗しても、直ちに Paste / D&D 不具合と断定してはいけない事象。

以降の節は、**再現手順・観測順・failure triage だけを改善対象とする** という前提で読んでください。

## Scope lock from issue-0010 and architecture
Task 1 / Task 3 の自己点検用に、本書が依拠する上流文書の責務をここで固定します。**この節は architecture の境界を言い換えるためではなく、runbook が逸脱していないことを明示するためのガードレール**です。

| Upstream source | Already fixed there | What this runbook is allowed to add | What this runbook must not redefine |
|---|---|---|---|
| `01_Plans/issues/issue-0010-phase5-native-paste-drop-provider.md` Progress Notes | native provider / shared parsing / fallback behavior を proof boundary とし、manual E2E に native/fallback 比較順・known unstable 分離・failure triage を残すこと | Progress Notes にある manual 運用項目を、再実行可能な手順・表・ログテンプレートへ落とす | acceptance criteria 自体の変更、issue status の判定基準変更 |
| `02_Architecture/vscode-extension-host-e2e.md` automation boundary | canonical path / compatibility path / shared-logic boundary / known unstable separation | manual 観測順、host class ごとの first path / comparison path、failure 記録方法 | canonical path / compatibility path の意味、delegated manual scope の範囲 |
| `04_Documentation/developer-setup.md` setup boundary | 前提条件、実行入口、`xvfb-run` prerequisite の setup 導線 | setup 後にどの順で manual E2E を進めるか | OS セットアップ手順の正本化、architecture handoff の再定義 |

### Boundary shorthand used in this runbook
- **manual scope**: Preview DOM / Problems UI / suggest widget / OS native paste-drop の最終観測順と記録方法。
- **automation scope**: `npm run test:e2e` が先に保証する proof boundary の読み方。
- **boundary rule**: automation と manual の境界線は architecture が固定済みで、本書はその境界線の**渡り方**だけを説明します。

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
- `npm install` 済みであること
- `xvfb-run` が利用可能であること
- Electron が利用する基本ライブラリ群

## Required setup for `xvfb-run`
自動 E2E を実行する前に、**必ず `xvfb-run` を導入して存在確認してから** `npm run test:e2e` を叩いてください。issue-0010 の Extension Host E2E では、この前提を省略してはいけません。

```bash
sudo apt-get update
sudo apt-get install -y xvfb
xvfb-run --help
```

- `xvfb-run --help` が成功したら、仮想ディスプレイ前提は満たされています。
- ここで失敗する場合は、`npm run test:e2e` を実行せず、まず OS パッケージ導入を完了させてください。

## Commands
```bash
cd 03_Implement
npm install
npm run build
xvfb-run --help
npm run test:e2e
```

## Command alignment: automation vs manual handoff
issue-0010 の運用では、**automation scope の確認** と **manual scope の観測** を同じ runbook 上で扱います。ただし、両者の役割を混ぜないよう、次の順番でコマンド整合を確認してください。ここでの order は **xvfb-run prerequisite → automated proof boundary → manual comparison path → keyword audit** の順に固定します。

| Order | Purpose | Command / action | Notes |
|---|---|---|---|
| 1 | headless prerequisite を先に固定する | `xvfb-run --help` | failure 時は automation blocked。native/fallback triage に進まない。 |
| 2 | 拡張バンドルを最新化する | `cd 03_Implement && npm run build` | manual E2E 開始前の前提。Development Host 起動前に実行する。 |
| 3 | Extension Host 自動確認を回す | `cd 03_Implement && npm run test:e2e` | automation scope の事実確認。native provider adapter / fallback command / diagnostics / completion API の境界を確認する。 |
| 4 | Development Host で manual E2E を始める | `F5` で `Run Extension` | OS native paste/drop, Preview DOM, Problems UI, suggest widget は manual scope。 |
| 5 | 文書更新後のキーワード監査を行う | `rg -n "native|fallback|Known unstable|autocomplete|Paste / D&D|DataTransfer|xvfb-run" 02_Architecture/vscode-extension-host-e2e.md 04_Documentation/vscode-e2e-testing.md 04_Documentation/developer-setup.md` | architecture / runbook / setup の語彙と運用導線が一致しているかを確認する。 |

**Interpretation rule**
- `npm run build` が通っていても、manual E2E の観測順までは保証しません。
- `npm run test:e2e` が通っていても、OS ネイティブ paste / drop の最終 UX は保証しません。
- manual E2E で native path だけ失敗しても、`npm run test:e2e` 側で fallback と shared logic が成立していれば、まず host capability 差として読みます。
- `#` 補完だけ不安定な場合は、上記どちらの結果にも自動的に連座させず、Known unstable として別管理します。

## What `npm run test:e2e` does
1. `npm run build` で Extension Host 用のテストバンドルを生成する。
2. `scripts/run-vscode-e2e.sh` が `xvfb-run` の有無を確認し、不足時は `sudo apt-get update && sudo apt-get install -y xvfb` → `xvfb-run --help` → `cd 03_Implement && npm run test:e2e` の順で再実行する手順をエラーメッセージとして案内する。
3. `runTest.ts` が fixture workspace を一時ディレクトリへ複製し、Diagnostics 用の `invalid.xml` を追加する。
4. `@vscode/test-electron` が VSCode を取得し、開発中の拡張を読み込んだ Extension Host を立ち上げる。
5. `test/e2e/suite/extensionHost.test.ts` が render / 補完 / Diagnostics / command fallback / native provider adapter の通し確認を実行する。

## First triage when `npm run test:e2e` fails
`npm run test:e2e` が失敗したら、**native/fallback の議論に入る前に** 次の順で切り分けてください。次エージェントはこの順番を崩さないでください。

1. **Headless prerequisite を確認する**
   - `xvfb-run --help` が通るか。
   - 通らないなら first triage の結論は **環境未充足** です。`xvfb` 導入を先に済ませ、provider triage へ進まないでください。
2. **Extension Host 起動まで進んだかを見る**
   - VSCode ダウンロード失敗、Electron 起動失敗、共有ライブラリ不足、ネットワーク失敗のどれかをログで確認する。
   - ここで止まっている場合、native provider / fallback command の成否はまだ未観測です。
3. **失敗箇所を 3 系統へ分類する**
   - completion / known unstable
   - diagnostics / render
   - Paste / D&D native-fallback boundary
4. **Paste / D&D 系なら comparison rule で読む**
   - fallback command assertion も落ちているか。落ちていれば共通解析または fixture 条件を先に疑う。
   - native adapter 観測だけが落ちているなら host capability 差または native surface 側を優先する。
5. **`Expected sheet completion after #.` 系なら Known unstable へ分離する**
   - filepath 補完と query parameter 補完が同じ run で生きているか先に確認する。
   - `#` 段だけなら、Paste / D&D の退行とは別チケット候補として扱う。

### First triage quick table
| First symptom | First interpretation | Immediate next step | Do not conclude yet |
|---|---|---|---|
| `xvfb-run is required` | headless prerequisite 不足 | `xvfb-run --help` が通る状態にする | native provider が壊れた |
| Electron / shared library / download failure | Extension Host 未起動 | VSCode 起動前提を直す | fallback command が壊れた |
| `Expected sheet completion after #.` | Known unstable 候補 | filepath / query 補完の同時成功有無を確認 | Paste / D&D 退行 |
| fallback command assertion fail | 共通解析または入力条件の問題 | fixture / DataTransfer 前提を確認 | native only 問題 |
| native adapter assertion fail + fallback pass | native surface / host capability 差 | host class と VSCode version を記録 | parser 全体が壊れた |

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

### Host matrix: what to run first on each host
次エージェントが迷わないよう、host の種類ごとの観測順序を固定します。**観測開始順は acceptance criteria の切り分け順そのもの** であり、manual E2E でも崩さないでください。native provider 対応可否を最初に固定し、次に first path と comparison path を必ず 1 セットで実施します。

| Host class | Capability expectation | First path | Comparison path | Separate triage | この host で確定したいこと |
|---|---|---|---|---|---|
| native provider 対応 host | `registerDocumentPasteEditProvider` / `registerDocumentDropEditProvider` が available | 通常の `Ctrl+V` / `Cmd+V`、通常の drag-and-drop | `markdownMatrixInjector.insertEmbedFromPaste` / `markdownMatrixInjector.insertEmbedFromDrop` | `#` 補完は別欄へ分離 | native path が canonical entry として観測でき、fallback と結果差がないこと |
| native provider 非対応 host | provider API unavailable、または host 制約で native path 不可 | `markdownMatrixInjector.insertEmbedFromPaste` / `markdownMatrixInjector.insertEmbedFromDrop` | 通常貼り付け / 通常 drop は参考観測 | `#` 補完は別欄へ分離 | fallback が unsupported host 向け compatibility path として成立すること |
| capability 未確定 host | provider API の有無をまだ確認していない | `markdownMatrixInjector.insertEmbedFromPaste` / `markdownMatrixInjector.insertEmbedFromDrop` | その直後に native path | `#` 補完は別欄へ分離 | まず fallback baseline を作り、native-only 障害か共通障害かを分離すること |

**Decision rule**
1. **native provider 対応 host**: native → fallback → separate triage の順で閉じる。
2. **native provider 非対応 host**: fallback を正規入口として扱い、native は参考観測に留める。
3. **capability 未確定 host**: まず fallback を通し、次に native を試し、その差分から capability 問題か共通処理問題かを判定する。
4. どの host class でも **比較入口を未実行のまま完了扱いにしない**。issue-0010 の fallback 方針を trace するため、native/fallback の比較記録が必要です。
5. capability 未確定 host では、**fallback baseline を先に確立してから native を試す**。これにより、native only failure と shared parser failure を誤読しません。

### Host-class completion rule
host class ごとの完了判定も固定します。**first path / comparison path / separate triage** の 3 点が揃うまで、manual E2E を Done 扱いにしないでください。

| Host class | First path 完了条件 | Comparison path 完了条件 | Separate triage 完了条件 | この host class で言ってよい結論 |
|---|---|---|---|---|
| native provider 対応 host | 通常 paste / 通常 drop のどちらも 1 回以上記録済み | fallback paste / fallback drop のどちらも同一入力で 1 回以上比較済み | autocomplete を Paste / D&D と別欄で記録済み | native path が canonical entry として観測でき、fallback との差分有無を説明できる |
| native provider 非対応 host | fallback paste / fallback drop を正規入口として 1 回以上記録済み | native path を参考観測として試すか、「未対応のため参考観測のみ」と理由付きで明記済み | autocomplete を別トラック化し、native 非対応と混同していない | fallback が compatibility path として成立し、native 不在を parser 障害へ誤変換していない |
| capability 未確定 host | fallback paste / fallback drop を baseline として 1 回以上記録済み | その直後に native path を同一入力で比較済み | autocomplete を別欄化し、capability 差と known unstable を切り分け済み | native-only failure か共通解析 failure かを区別でき、host class を最終的に更新できる |

### Practical boundary: what next agents should conclude
この節は **failure triage の短縮版** です。次の 3 パターンを先に読めば、manual E2E の conclusion を誤読しにくくなります。

| Observed result | First reading | ここで確定してよいこと | ここで確定してはいけないこと |
|---|---|---|---|
| native Fail / fallback Pass | native surface または host capability 差 | fallback policy は成立している | shared parser 全体が壊れた、とは言わない |
| native Fail / fallback Fail | shared parser / payload issue | native only failure ではない | native provider 非対応だけで説明しない |
| autocomplete `#` only Fail | Known unstable separate triage | Paste / D&D と別トラックで管理する | Paste / Drop も壊れている、と連座させない |

補足:
- **Automated で Pass**: 解析ロジックと fallback command は少なくとも Extension Host レベルで成立している。manual はその上に UX / host 差分を観測する handoff 先です。
- **`xvfb-run` 未導入で automation 未実施**: provider failure ではなく entry condition 未充足。manual scope only の run として記録し、automation handoff は保留にする。

### Acceptance-to-runbook mapping
この runbook では、issue-0010 の acceptance と Progress Notes を次の 5 つの運用正本に固定します。

| Concern | Operational source of truth | First question | Escalation boundary |
|---|---|---|---|
| native provider が canonical path | native path を first path として観測する | host は native provider 対応か | native only failure なら host capability / OS event を疑う |
| fallback command が unsupported host 向け compatibility path | fallback path を comparison または first path として必ず観測する | fallback は同一入力で成功するか | fallback も失敗したら shared parser / payload を疑う |
| shared logic 再利用方針 | native / fallback の両方で DataTransfer 起点の同一解釈を確認する | 両経路の挿入結果はどこまで一致するか | 解析差分は provider 可否ではなく shared logic 側で追う |
| `xvfb-run` 前提と manual/automation handoff | headless prerequisite を最初に確認する | Extension Host を起動する前提は満たされているか | 欠落時は automation blocked、manual は別記録 |
| autocomplete Known unstable の分離 | `#` 補完 failure を Paste / D&D から独立管理する | filepath / query は生きているか | `#` だけ失敗なら Known unstable として閉じる |

## Observation order contract
manual E2E の観測順序は次の契約で固定します。次エージェントは host ごとの例外運用を考えず、この順で進めてください。

1. **Capability record**: host class と provider availability を最初に確定または暫定記録する。
2. **Baseline UI**: Preview → Problems → Autocomplete の順で、Paste / Drop 実行前の基準状態を記録する。
3. **First path**: host class に応じた初手を 1 回だけ先に試す。
4. **Comparison path**: 直後にもう一方の入口を同一入力で実施し、差分を記録する。
5. **Separate triage**: autocomplete の既知不安定は最後に独立判定し、Paste / Drop 結果へ混ぜない。

この contract により、native provider host / fallback only host / capability 未確定 host のどれでも、**「どの入口から観測を始めたか」** と **「比較対象を実行済みか」** を必ず残せます。

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

### If `xvfb-run` is not installed
manual E2E 自体は GUI を開ける host で進められますが、issue-0010 の acceptance trace では **automation scope の未実施理由を先に固定** してから manual scope に進んでください。

1. `xvfb-run --help` を実行する。
2. 通らない場合は、automation scope の結論を **`xvfb-run` 未導入による headless prerequisite 未充足** と記録する。
3. その状態では `npm run test:e2e` を provider failure と読まない。まず `sudo apt-get update && sudo apt-get install -y xvfb` を案内し、導入後に `xvfb-run --help` を再確認する。
4. どうしても当該 host で `xvfb-run` を入れられない場合は、manual E2E を続行してよいが、結果ログに **「manual scope only / automation blocked by missing xvfb-run」** と明記する。
5. つまり `xvfb-run` 未導入は **環境未充足** であり、native provider / fallback / DataTransfer triage に入る前段の停止条件です。

## Manual execution order (run this top to bottom)
比較観測の順番を固定します。**native path / fallback path / known unstable** を混同しないため、必ず次の順に進めてください。ここでの順序は issue-0010 の未完了条件である **manual E2E による fallback 方針の明示** と **native/fallback 境界の運用再現** に直接対応します。

1. **Setup を完了する**
   - Manual environment setup の手順どおり Development Host を起動する。
   - 比較用 Markdown (`phase5-preview-manual.md`) を保存した状態にする。
   - 入力元アプリ候補（Excel / Google Sheets / ブラウザ table / Explorer 上の CSV など）を準備しておく。
2. **Capability を先に記録する**
   - VSCode version、OS、Development Host / 通常ホストのどちらかをメモする。
   - `registerDocumentPasteEditProvider` / `registerDocumentDropEditProvider` が available か unavailable か unconfirmed かを最初に書く。
   - 未確定なら「何を根拠に未確定としたか」も 1 行残す。
3. **Preview / Problems / autocomplete を先に確認する**
   - Checklist A → Checklist B → Checklist C の順に実施する。
   - この順番にしておくと、Paste / D&D で本文が変化しても基準状態を失わない。
4. **Paste は host class に応じた初手で開始する**
   - capability 未確定 host と native provider 非対応 host では、`markdownMatrixInjector.insertEmbedFromPaste` を先に実行する。
   - native provider 対応 host では、通常 paste を先に観測してから fallback command を比較実行する。
   - 1 回目実行前に、貼り付け位置とクリップボード元アプリをログへ書く。
5. **Drop も同じ順序で比較する**
   - capability 未確定 host と native provider 非対応 host では、`markdownMatrixInjector.insertEmbedFromDrop` を先に実行する。
   - native provider 対応 host では、通常 drop を先に観測してから fallback command を比較実行する。
   - 1 回目実行前に、ドロップ元ファイル名と単一/複数ファイル条件をログへ書く。
6. **Autocomplete の失敗は最後に独立判定する**
   - `#` 直後だけ候補 0 件のときは Known unstable として separate log に分ける。
   - Paste / D&D の成否判定には混ぜない。
7. **Result log を埋めて acceptance criteria へ結びつける**
   - native provider 対応可否、fallback 成立可否、known unstable の有無をそれぞれ別欄で記録する。
   - これにより issue-0010 の「native provider surface」「fallback 方針」「manual E2E 再現性」を 1 回の手順で trace できる。

### Manual execution quick map by host class
次エージェントが host class ごとの first move を即決できるよう、manual E2E の開始順を簡略表でも固定します。**読む順は First path → Comparison path → Separate triage の 3 列です。**

| Host class | Baseline before Paste / D&D | First path | Comparison path | Separate triage | First conclusion | Completion gate |
|---|---|---|---|---|---|---|
| native provider 対応 host | Preview → Problems → Autocomplete | 通常 paste / 通常 drop | fallback command | autocomplete を別欄へ記録 | native path が canonical に動くか | native/fallback の両経路記録 + autocomplete 分離記録 |
| native provider 非対応 host | Preview → Problems → Autocomplete | fallback command | 通常 paste / 通常 drop は参考観測 | autocomplete を別欄へ記録 | fallback 方針が運用上成立するか | fallback 成功記録 + native 参考観測理由 + autocomplete 分離記録 |
| capability 未確定 host | Preview → Problems → Autocomplete | fallback command | 通常 paste / 通常 drop | autocomplete を別欄へ記録 | native-only failure か共通 failure か | fallback baseline + native comparison + host class 更新記録 |

この簡略表は `Host matrix` の運用版です。判定に迷った場合は、**「未確定 host では先に fallback」** を優先し、その直後に comparison path を同一入力で実施してください。

### Separate triage quick runbook
Paste / D&D と Known unstable を混線させないため、最後の判定だけを 1 表に圧縮します。**native only failure** と **shared parser failure** を読み違えないための最短表でもあります。

| Observed combination | まず付けるラベル | 先に閉じてよい範囲 | 追加で残すべき記録 |
|---|---|---|---|
| native Pass / fallback Pass / autocomplete Fail(`#` only) | Known unstable separate | Paste / D&D は Pass 扱い可 | `#` 補完のみ別欄へ記録 |
| native Fail / fallback Pass | host capability or native path issue | fallback policy 成立まで | OS、VSCode version、入力元アプリ or dropped file |
| native Fail / fallback Fail | shared parser or payload issue | host capability 問題だけでは閉じない。共通解析 failure として扱う | DataTransfer / clipboard / dropped payload 条件 |
| autocomplete `#` only Fail | Known unstable separate | Paste / D&D 判定へ混ぜない | filepath / `?` 補完が生きていたか |
| `xvfb-run` missing | environment prerequisite missing | automation blocked まで | `xvfb-run --help` の結果と manual-only 実施有無 |

## Checklist A: Markdown Preview / Preview DOM
**Classification**: Manual  
**目的**: Preview DOM は自動 E2E 未対象なので、Preview 上の見た目とエラー表示を確認する。

### Steps
1. エディタで `phase5-preview-manual.md` を開き、`Markdown: Open Preview to the Side` を実行する。
2. `Valid table` セクションで、表が 2 列以上の HTML table として表示されることを確認する。
3. `Missing file` / `Missing sheet` / `Invalid xml` の各セクションで、壊れた空白ではなく、埋め込み失敗が分かるエラー表示または代替 UI が描画されることを確認する。
4. Preview をスクロールし、表やエラー UI が極端に重ならないこと、Markdown 見出しとの順序が崩れないことを確認する。

### Observation points
- `Valid table` は header 行と data 行の区別が見えるか。
- エラー系 3 件は空白ではなく、失敗種別が推測できる UI になっているか。
- Preview 側の表示順がエディタ本文の順番と一致しているか。

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

### Observation points
- 件数が常に 3 件に保たれるか。
- 行ジャンプ先が embed 行と一致するか。
- コード表示がメッセージだけでなく識別子レベルで区別できるか。

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
8. **`#` 直後だけ候補が出ない場合でも、その場で Paste / D&D 不具合へ昇格させず、Known unstable 用の記録欄へ分離する。**

### Observation points
- filepath → sheet/range → query parameter の順で候補集合が切り替わるか。
- 候補確定後に記法の括弧や `#` / `?` の境界が壊れないか。
- `#` 直後だけ候補が消える場合、Paste / D&D とは別の既知不安定として見分けられるか。

### Expected results
- `![[` 直後は filepath 候補、`#` 直後は sheet/range 候補、`?` 直後は query 候補と、段階的に切り替わる。
- 候補選択後、既存文字列を壊さず embed 記法の続きを自然に入力できる。
- 補完 UI がカーソル近傍に表示され、候補 0 件なのに無言で閉じるような違和感がない。

### Failure hints
- 補完が出ない場合は言語モードが Markdown か、カーソルが `![[`, `#`, `?` の直後かを確認する。
- filepath 候補だけ出る場合は fixture workspace を開いているか確認する。
- 候補確定後に括弧が壊れる場合は、どのトリガー文字で崩れたかを記録する。
- `#` 直後の sheet 候補だけが 0 件でも、Paste / D&D 回りの失敗とは混同しない。known unstable の節へ分離して記録する。
- 特に **Paste / Drop をまだ試していない段階では、autocomplete Failure から provider failure を推定しない**。

## Checklist D: Paste comparison (native paste vs fallback paste)
**Classification**: Manual  
**目的**: native paste provider の経路と fallback command の経路を比較し、どちらが利用されたか誤解なく記録する。

### Input conditions
| Item | Required condition |
|---|---|
| Editor state | `phase5-preview-manual.md` を開き、比較用の空行を 2 行以上確保していること |
| Clipboard source | Excel / Google Sheets / HTML table をコピーできるアプリを 1 つ固定すること |
| Comparison rule | 1 回目と 2 回目で **同じ表データ** を使うこと |
| Host log | host class と provider availability を先に記録していること |

### Steps
1. OS 上で Excel / Google Sheets / 表計算ソフト、または HTML table をコピーできるブラウザを準備する。
2. その表をコピーし、Development Host の Markdown エディタへ戻る。
3. **host class に応じて開始入口を選ぶ。**
   - native provider 対応 host: 新しい行で `Ctrl+V` / `Cmd+V` を先に実行する。
   - native provider 非対応 host または capability 未確定 host: `markdownMatrixInjector.insertEmbedFromPaste` を先に実行する。
4. 1 回目の結果を保存し、続けて比較対象のもう一方の入口も必ず実行する。
5. `Editor: Paste As...` のような VSCode 側 UI を経由した場合は、それも別列で記録する。
6. 挿入結果の差分を見て、native path / fallback path / 入力元アプリ差のどれが主要因かを判定する。
7. 結果を Failure log template または Summary table に転記する。

### Observation points
- native paste と fallback command で、挿入された `![[...]]` の文字列差があるか。
- 何も変換されなかった場合、そのとき clipboard 元アプリと host capability は何か。
- 1 回目と 2 回目で同じ入力を使ったか。

### Expected results
- native provider 対応 host では、通常の貼り付け操作だけでベストエフォートの `![[...]]` 形式 embed またはそれに準ずる提案結果が挿入される。
- native provider 非対応 host では、通常貼り付けで変換されない代わりに `markdownMatrixInjector.insertEmbedFromPaste` を使って同等の embed を再現できる。
- 挿入直後に Markdown が壊れず、少なくとも 1 行の有効な embed 記法として残る。
- 期待どおりの変換ができない場合も、無言失敗ではなく「何も変換されなかった」事実を記録できる。

### How to read failures
- **native paste Fail / fallback paste Pass**: native provider 未対応 host、または host 側制約を優先的に疑う。issue-0010 の受入条件上は **fallback 方針が成立している** ので、manual E2E では host class と入力元アプリを明記してクローズできる。
- **native paste Fail / fallback paste Fail**: 共通解析ロジックまたは入力元 HTML metadata を疑う。issue-0010 の fallback 境界だけでは説明できないため、Paste / D&D 共通障害として扱う。
- **native paste Pass / fallback 未実行**: 記録不足。比較対象として fallback も少なくとも 1 回は実行する。
- **autocomplete も同時 Fail**: 直ちに Paste 不具合へ統合しない。まず Known unstable 手順で `#` 補完だけの障害かを分離する。

### Failure hints
- OS/ブラウザ差で clipboard HTML が取得できないことがあるため、利用したアプリ名と OS を必ず記録する。
- 通常貼り付けで何も起きない場合は、host が native paste provider 非対応か、clipboard の HTML メタデータが不足しているかを切り分ける。
- fallback command では成功する場合、native provider 未対応または host 側制約の可能性が高い。
- 文字化けや複数行崩れがあれば、貼り付け前後の本文差分を残す。
- autocomplete が同じ run で失敗していても、Paste failure 欄の結論は native/fallback 比較結果だけで書く。

## Checklist E: Drag & Drop comparison (native drop vs fallback drop)
**Classification**: Manual  
**目的**: native drop provider と fallback drop command の差分を同じ入力条件で確認する。

### Input conditions
| Item | Required condition |
|---|---|
| Editor state | `phase5-preview-manual.md` を開き、drop 比較用の空行を 2 行以上確保していること |
| Drop source | `sample.csv` など fixture 内の単一ファイルを最初の比較対象に固定すること |
| Comparison rule | 1 回目と 2 回目で **同じファイル** を使うこと |
| Host log | host class と provider availability を先に記録していること |

### Steps
1. ホスト OS のファイルマネージャ、または Development Host の Explorer から `sample.csv` 等をつかめる状態にする。
2. **host class に応じて開始入口を選ぶ。**
   - native provider 対応 host: Markdown エディタ上の空行へ CSV / XLSX / XML ファイルを通常ドロップする。
   - native provider 非対応 host または capability 未確定 host: まず `markdownMatrixInjector.insertEmbedFromDrop` を実行する。
3. 1 回目の結果を保存し、続けて比較対象のもう一方の入口も必ず実行する。
4. 複数ファイルを同時にドロップできる環境なら、単一ファイル時との差も確認する。
5. 挿入結果の差分を見て、native path / fallback path / dropped payload 差のどれが主要因かを判定する。
6. 結果を Failure log template または Summary table に転記する。

### Observation points
- native drop と fallback command で、相対/絶対パスやシート補完の差が出るか。
- 無変化だった場合、それが native だけか両方か。
- 単一ファイルと複数ファイルで結果差があるか。

### Expected results
- native drop provider 対応 host では、少なくとも単一ファイルのドロップで `![[...]]` 記法が 1 つ挿入される。
- native provider 非対応 host では、`markdownMatrixInjector.insertEmbedFromDrop` 実行で同等の挿入結果を再現できる。
- 挿入パスが絶対/相対のどちらになったかを確認し、次エージェントが再現できるよう記録できる。
- 未対応形式や複数ドロップ時は、落ちるのではなく「未変換」または既知制約として扱える。

### How to read failures
- **native drop Fail / fallback drop Pass**: native drop provider 未対応 host、または host 側 drop event 制約を優先的に疑う。issue-0010 の受入条件上は **fallback 方針が成立** しているため、manual E2E では host capability と dropped source を明記する。
- **native drop Fail / fallback drop Fail**: dropped file 解析か入力 payload を優先的に疑う。fallback 境界だけでは説明できない。
- **native drop Pass / fallback 未実行**: 比較記録としては不十分。fallback も最低 1 回実行する。
- **autocomplete も同時 Fail**: Paste と同様、drop failure 判定へ混ぜず Known unstable 手順で分離する。

### Failure hints
- 通常ドロップで本文無変化なら、host が native drop provider 非対応か、VSCode 標準のファイル挿入と競合していないか確認する。
- fallback command では成功する場合、native drop provider 未対応または host 側制約として記録する。
- Development Host とホスト VSCode で挙動差がある場合は、どちらで再現したか明記する。
- 複数ファイル時に一部だけ入る場合は、順序と実際に入ったパスを記録する。
- autocomplete が同じ run で失敗していても、D&D failure 欄の結論は native/fallback 比較結果だけで書く。

## Known unstable: autocomplete must be tracked separately
**Classification**: Known unstable

この節は **Paste / D&D triage から autocomplete を切り離すための独立節** です。ここに該当した failure は、Checklist D / E の失敗件数へ混ぜません。

- headless VSCode 1.112 系では、`vscode.executeCompletionItemProvider` による sheet 候補取得が 0 件になることがあります。
- 既存 assertion `Expected sheet completion after #.` は、この既知不安定要因の影響を受ける場合があります。
- 現行テストは 200ms 間隔・最大 15 回の再試行に加え、最終的な completion state (`vscodeVersion`, `platform`, `DISPLAY`, `lineText`, `position`, `attempts`, `labels`) を警告ログへ残します。
- 切り分けの観点は次のとおりです。
  - filepath 補完と query parameter 補完が同一実行で成功しているか。
  - `#` 直後だけ labels が document words に寄るか / 空になるか。
- 後者なら、cursor position や trigger character の全面故障ではなく、sheet metadata 読み出しまたは headless host の suggest 挙動差を優先的に疑ってください。
- この不安定要因は issue-0010 の native provider 変更とは独立に残っているため、**autocomplete の失敗を Paste / D&D の失敗と混同しない** ことが重要です。

### Triage order for autocomplete vs Paste / D&D
autocomplete の失敗を見つけたときは、次の順で判断してください。

1. `![[` 直後の filepath 補完が出るか確認する。
2. `?` 直後の query parameter 補完が出るか確認する。
3. `#` 直後だけ失敗しているなら、まず Known unstable として記録する。
4. その状態でも Paste / D&D の native path / fallback path は別チェックリストで独立に実施する。
5. 1〜4 を満たしたうえで、Paste / D&D も同じ run で壊れているなら、初めて「共通環境要因の可能性あり」と注記する。

### Fast triage table
| Symptom | First interpretation | Next action | Must not do |
|---|---|---|---|
| filepath 補完 OK / `?` 補完 OK / `#` 補完だけ NG | Known unstable の可能性が高い | Autocomplete 欄へ別記録し、Paste / D&D は予定どおり続行 | Paste / D&D 失敗と断定しない |
| Paste native NG / Paste fallback OK | native provider または host capability 差 | host class と clipboard source を記録する | autocomplete failure とまとめて 1 件化しない |
| Drop native NG / Drop fallback OK | native drop provider または host capability 差 | host class と dropped file を記録する | Paste failure と一括りにしない |
| Paste fallback NG / Drop fallback NG | 共通解析または入力条件の問題 | 入力データと payload を再確認する | native provider 非対応だけを原因にしない |

## Reproduction and failure isolation workflow
Paste / D&D の不具合を切り分けるときは、必ず次の順番で確認してください。**この節は Native provider and fallback policy / Known unstable / Failure log template をつなぐ中核フロー** です。

1. **Host capability を記録する**
   - Development Host の `Developer: Toggle Developer Tools` や Extension Host のログで、利用中 VSCode version を記録する。
   - `registerDocumentPasteEditProvider` / `registerDocumentDropEditProvider` が存在する前提の host か、fallback only host かを最初にメモする。
2. **host class に応じて first path を決める**
   - native provider 対応 host では native path を first path にする。
   - fallback only host / capability 未確定 host では fallback command を first path にする。
3. **comparison path を必ず同一入力で実施する**
   - `markdownMatrixInjector.insertEmbedFromPaste` または `markdownMatrixInjector.insertEmbedFromDrop` を比較対象として実行し、native path と同一入力で差分を取る。
   - fallback が失敗する場合は native provider ではなく、解析ロジック全体または入力データの問題として扱う。
4. **native path だけ失敗した場合の結論を限定する**
   - Paste は `Ctrl+V` / `Cmd+V`、Drop は通常のドラッグ&ドロップで挿入を試す。
   - native path だけ失敗する場合、host capability・OS・入力元アプリ・DataTransfer payload 種別を記録し、**「fallback 方針は成立」までを結論** とする。
5. **autocomplete 失敗は別トラックに分離する**
   - `Expected sheet completion after #.` 相当の失敗は、Paste / D&D 回りと同一原因とみなさない。
   - 同一実行で併発しても、ログ上は autocomplete と paste/drop を別項目に分ける。

### Runbook note: known unstable vs Paste / D&D regression
- **Known unstable** は `#` 補完の不安定性を指すラベルであり、native paste / native drop / fallback command の pass-fail を上書きしません。
- したがって `#` 補完 failure を見つけても、Checklist D / E をまだ実施していないなら **Paste / D&D 退行判定を保留** してください。
- 逆に、Paste / D&D の native/fallback 比較が終わっているなら、autocomplete が同時失敗していても **Paste / D&D 欄の結論は native/fallback 比較結果だけで確定** して構いません。
- この順序を崩すと、issue-0010 の acceptance criteria にある fallback 方針の明示と Known unstable 分離が同時に壊れます。

## Recommended checklist summary
実地確認時は、少なくとも次の順番でチェックしてください。Failure triage と result log template がこの並びを前提にしているため、順序を入れ替えないでください。**完了条件は「host class を固定し、first move と comparison を同一入力で記録し、Known unstable を別欄へ分離した」状態です。**

- [ ] Manual setup が完了している。
- [ ] Host capability を記録した。
- [ ] Checklist A: Preview DOM を確認した。
- [ ] Checklist B: Problems パネルを確認した。
- [ ] Checklist C: autocomplete を確認した。
- [ ] native provider 対応/非対応/未確定のどの host class かを記録した。
- [ ] Checklist D: **1 回目の Paste 入口** を host class に応じて選んだ。
- [ ] Checklist D: **比較対象の Paste 入口** を追加実行した。
- [ ] Checklist E: **1 回目の Drop 入口** を host class に応じて選んだ。
- [ ] Checklist E: **比較対象の Drop 入口** を追加実行した。
- [ ] autocomplete の失敗有無を Paste / D&D と分離して記録した。
- [ ] Failure log template に結果を転記した。
- [ ] manual runbook の完了条件を満たしたと短く要約できる。

## Suggested manual result log template
手動確認の結果は、次のテンプレートで残すと差分を追いやすくなります。

### Summary table
| Date | VSCode version | OS | Host capability | Checklist | First path tried | Comparison path tried | Result | Notes |
|---|---|---|---|---|---|---|---|---|
| YYYY-MM-DD | 1.xx | Ubuntu/macOS/Windows | native paste/drop available or fallback only / capability unconfirmed | Preview DOM | n/a | n/a | Pass/Fail | 例: invalid XML は赤枠表示 |
| YYYY-MM-DD | 1.xx | Ubuntu/macOS/Windows | native paste/drop available or fallback only / capability unconfirmed | Problems | n/a | n/a | Pass/Fail | 例: 3 件表示、行ジャンプ正常 |
| YYYY-MM-DD | 1.xx | Ubuntu/macOS/Windows | native paste/drop available or fallback only / capability unconfirmed | Autocomplete | filepath → sheet → query | n/a | Pass/Fail | 例: `?` で `header=` 候補あり / `#` で sheet 0件 |
| YYYY-MM-DD | 1.xx | Ubuntu/macOS/Windows | native paste/drop available or fallback only / capability unconfirmed | Paste | native or fallback | the other path | Pass/Fail | 例: native paste は無変化だが fallback 成功 |
| YYYY-MM-DD | 1.xx | Ubuntu/macOS/Windows | native paste/drop available or fallback only / capability unconfirmed | D&D | native or fallback | the other path | Pass/Fail | 例: 単一 CSV は native 成功、複数 drop は未変換 |

### Detailed log template
```md
## Manual E2E log
- Date:
- VSCode version:
- OS:
- Workspace:
- Host class: native provider available / fallback only / capability unconfirmed
- Host capability:
  - registerDocumentPasteEditProvider: available / unavailable / unconfirmed
  - registerDocumentDropEditProvider: available / unavailable / unconfirmed
- Observation order followed?: yes / no

### Preview DOM
- Result:
- Observation points:
- Notes:

### Problems
- Result:
- Observation points:
- Notes:

### Autocomplete
- Result:
- filepath completion:
- `#` completion:
- `?` completion:
- Known unstable involved?: yes / no
- Must stay separate from Paste / D&D?: yes
- Notes:

### Paste
- Input source app:
- First path tried: native / fallback
- Comparison path tried: native / fallback
- Native paste result:
- Fallback command result:
- Did fallback establish policy?: yes / no
- DataTransfer / clipboard notes:
- Notes:

### D&D
- Input source:
- First path tried: native / fallback
- Comparison path tried: native / fallback
- Native drop result:
- Fallback command result:
- Did fallback establish policy?: yes / no
- DataTransfer notes:
- Notes:
```

### Failure log template (copy for regressions)
```md
## Failure record
- Date:
- VSCode version:
- OS:
- Host class:
- Failing area: Preview / Problems / Autocomplete / Paste / D&D
- First path tried:
- Comparison path tried:
- Expected:
- Actual:
- Did fallback pass?: yes / no / not run
- Did native path pass?: yes / no / not run
- Fallback-only conclusion allowed?: yes / no
- Known unstable suspected?: yes / no
- Input source app or file:
- DataTransfer notes:
- Attached logs / screenshots:
- Next hypothesis:
```

## Cross-reference map
- **Native provider and fallback policy** を読むと、host class ごとの first path / comparison path が分かります。
- **Known unstable** を読むと、autocomplete failure を Paste / D&D から分離してよい条件が分かります。
- **Reproduction and failure isolation workflow** を読むと、上記 2 系統をどの順で result log template に落とすかが分かります。
- **Suggested manual result log template / Failure log template** は、issue-0010 の acceptance criteria のうち「fallback 方針の明示」と「manual E2E 再現性」の記録面を担当します。

## Host-class tracking sheet (minimum record)
first path / comparison path / separate triage を host class ごとに追跡しやすくするため、manual log の前に最低限この表を埋めてください。**この表が埋まっていれば、known unstable autocomplete が Paste / D&D 判定へ混入していないことを後から監査できます。**

| Host class | First path (Paste / D&D) | Comparison path | Separate triage record | Required evidence |
|---|---|---|---|---|
| native provider 対応 host | native paste, native drop | fallback paste command, fallback drop command | autocomplete を別欄へ記録 | native/fallback の結果差 + host capability |
| native provider 非対応 host | fallback paste command, fallback drop command | native path は参考観測、または unavailable 理由を明記 | autocomplete を別欄へ記録 | fallback 成功 + native unavailable 根拠 |
| capability 未確定 host | fallback paste command, fallback drop command | 直後に native paste, native drop | autocomplete を別欄へ記録 | fallback baseline + native comparison + 更新後 host class |

## Acceptance and progress-note source-of-truth map
issue-0010 の acceptance criteria / Progress Notes に対して、runbook では次の節を運用正本とします。architecture 境界の再定義は行わず、**どの手順・表・判断基準で追跡するか** だけを固定します。

| Acceptance / progress note | Runbook source of truth | Why this section is authoritative |
|---|---|---|
| Acceptance 1: native provider surface から発火できること | `Native provider and fallback policy`, `Host matrix`, `Checklist D`, `Checklist E` | native canonical path を first path / comparison path として追跡できるため |
| Acceptance 2: `pasteDrop.ts` を再利用し二重実装しないこと | `Automated coverage`, `Native provider and fallback policy`, `Practical boundary` | native と fallback が同一 DataTransfer 解釈へ収束する前提を運用語彙で固定するため |
| Acceptance 3: fallback 方針が明示されていること | `Fallback path`, `Host-class completion rule`, `Reproduction and failure isolation workflow` | fallback compatibility path を unsupported host / unconfirmed host でも追跡できるため |
| Acceptance 4: unit / E2E の双方で退行がないこと | `Command alignment: automation vs manual handoff`, `First triage when npm run test:e2e fails`, `Checklist A-E` | automation boundary と manual boundary の handoff を 1 本の運用導線として固定するため |
| Progress note: native provider registration surface / shared parsing / fallback command behavior を proof boundary とする | `Automated coverage`, `Native provider and fallback policy`, `Acceptance-to-runbook mapping` | automated proof boundary と manual comparison boundary を同じ runbook 上で参照できるため |
| Progress note: `xvfb-run` 未導入なら環境起因で E2E 未完了 | `Required setup for xvfb-run`, `First triage when npm run test:e2e fails`, `If xvfb-run is not installed` | xvfb-run prerequisite を provider/fallback failure と混同しないため |
| Progress note: known unstable autocomplete を Paste / D&D から分離する | `Checklist C`, `Known unstable`, `Separate triage quick runbook`, `Host-class tracking sheet` | separate triage を host-class 記録へ必須化し、Paste / D&D と別欄で閉じられるため |

## issue-0010 acceptance trace (documentation)
本書で満たす文書トレースを、受入条件ごとに固定します。

1. **native provider surface から発火できること**
   - `Automated coverage`, `Native provider and fallback policy`, `Checklist D`, `Checklist E` で native path の観測点を保持する。
2. **既存解析ロジックを再利用し、二重実装しないこと**
   - `Automated coverage`, `Native path`, `Fallback path` で DataTransfer 解析ロジック再利用を明記する。
3. **native provider 非対応環境で fallback 方針が明示されること**
   - `Host matrix`, `Observation order contract`, `How to read failures`, `Reproduction and failure isolation workflow` で fallback only host の運用を明文化する。
4. **manual E2E の再現性があること**
   - `Manual environment setup`, `Manual execution order`, `Checklist A-E`, `Suggested manual result log template`, `Failure log template` で再現手順・比較順・失敗ログを固定する。
5. **autocomplete known unstable を独立運用できること**
   - `Checklist C`, `Known unstable`, `Fast triage table`, `Cross-reference map` で Paste / D&D と混同しない導線を作る。

## Manual runbook completion rule (short summary)
manual runbook は、**同じ host class で同じ比較順を再実行でき、native only failure / shared parser failure / Known unstable を別々に記録できる状態** になった時点で完了です。

## Boundary self-check before closing the document task
Task 3 の自己点検として、文書更新後に次の 4 問へ **すべて Yes** と答えられるか確認してください。

1. native / fallback / shared logic / known unstable の**定義そのもの**を変更せず、観測順と triage 順だけを書いたか。
2. delegated manual scope の具体化として、Preview DOM / Problems UI / suggest widget / OS native paste-drop の観測手順だけを追加したか。
3. `xvfb-run` prerequisite を provider/fallback failure と混同せず、entry condition として先に扱っているか。
4. host class ごとの first path / comparison path / failure log template が、automation scope の再説明ではなく manual runbook の再現性向上に使われているか。

上の 4 問のどれかが No なら、本書は architecture の責務へ踏み込み過ぎています。文書を閉じる前に、その記述を runbook の操作語彙へ戻してください。

## Keyword audit for issue-0010 operations
文書更新後は、少なくとも次のキーワードが欠けていないか `rg` で確認してください。

```bash
rg -n "native|fallback|manual|xvfb|autocomplete" 04_Documentation/vscode-e2e-testing.md 02_Architecture/vscode-extension-host-e2e.md
```

確認観点:
- `native` と `fallback` が architecture と runbook の両方で比較境界として現れているか。
- `manual` と `autocomplete` が delegated manual scope / known unstable separation の文脈で残っているか。
- `xvfb` が prerequisite / triage / handoff のいずれかで明示されているか。

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
本書が issue-0010 の acceptance criteria を文書面で補完する範囲を、短い対応表で固定します。

| Acceptance criteria / task | 本書で担保する節 | 要約 |
|---|---|---|
| native provider surface から発火できること | `Automated coverage`, `Checklist D`, `Checklist E` | native path を自動確認の境界と manual 観測手順の両方で追跡する。 |
| 既存解析ロジックを再利用し二重実装しないこと | `Automated coverage`, `Native provider and fallback policy` | native / fallback が同じ DataTransfer 解析ロジックを共有する前提を明示する。 |
| native provider 非対応 host の fallback 方針が明示されていること | `Host matrix`, `Manual execution quick map by host class`, `Failure triage` | fallback only host の first move・comparison・結論範囲を固定する。 |
| Extension Host E2E と運用ドキュメントを更新すること | `Command alignment`, `Manual execution order`, `Checklist A-E`, `Failure log template` | automation と manual の handoff、比較順、記録方法を自己完結で再現できるようにする。 |
| known unstable を Paste / D&D と混線させないこと | `Checklist C`, `Known unstable`, `Fast triage table` | autocomplete は別トラックで記録し、Paste / D&D の成否へ混ぜない。 |

## Stream B completion summary
この Stream は **運用手順の明確化のみ** を担当し、architecture や implementation の再定義を行いません。そのため、他 Stream の完了待ちをせず本書単体でクローズできます。

- host class を **native provider 対応 / 非対応 / capability 未確定** の 3 分類で固定し、それぞれの first path / comparison path / separate triage / completion gate を明文化した。
- `xvfb-run` 未導入時は provider triage に進まず、**headless prerequisite 未充足** として automation blocked を先に記録する runbook を追加した。
- fallback policy を **unsupported host 向け compatibility path** として明示し、native Fail / fallback Pass と native Fail / fallback Fail を別結論で読む表へ整理した。
- Known unstable と Paste / D&D regression の関係を、autocomplete `#` only Fail を独立させる separate triage として閉じる手順へ整理した。
- manual E2E がまだ必要な理由は、Preview DOM / Problems UI / suggest widget / OS native paste/drop の最終挙動が automation boundary の外にあり、delegated manual scope でしか確認できないためです。
- 以上により、issue-0010 の manual scope は **xvfb-run prerequisite → automation proof boundary → manual comparison path → keyword audit** の導線を保ったまま、**first path / comparison path / separate triage / fallback policy trace** の 4 点を文書単体で再現可能です。
