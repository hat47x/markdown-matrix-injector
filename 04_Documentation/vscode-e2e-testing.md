# VSCode Engine E2E Testing Guide

## Publication
- Public Gist: [https://gist.github.com/<YOUR_GITHUB_ACCOUNT>/mmi-vscode-e2e-testing](https://gist.github.com/<YOUR_GITHUB_ACCOUNT>/mmi-vscode-e2e-testing)
- Canonical source: `04_Documentation/vscode-e2e-testing.md`

## Target reader
- VSCode Extension Host E2Eを再実行する開発者
- manual E2Eの観測結果を整理するQA / delivery担当者

## Prerequisites
- `04_Documentation/developer-setup.md` のsetup / headless prerequisiteを満たしていること
- `03_Implement` 配下でbuildとtest:e2eを実行できること

## Expected result
この文書を読むと、automationとmanualの境界、host classごとの観測順、failure triageの手順を再現できます。

## Related docs
- `04_Documentation/developer-setup.md`
- `02_Architecture/vscode-extension-host-e2e.md`
- `04_Documentation/history/issues/issue-0010-phase5-native-paste-drop-provider.md`

## Known limitations
- Preview DOMやOSネイティブイベントの最終UXはmanual観測に依存します。
- `#` 補完には既知の不安定要因があり、Paste / D&Dの退行と分離して評価する必要があります。


## Purpose and scope
この文書は、issue-0010の未完了条件に対して manual E2Eの運用正本 として使うものです。ここで扱う範囲は次の3点に限定します。

1. **再現手順**: 次エージェントが同じhost class / 同じ入力条件でmanual E2Eをやり直せること。
2. **観測順**: host classごとのfirst move、native path / fallback pathの比較順、manualとautomationのhandoffを固定すること。
3. **failure triage**: native path・fallback path・Known unstableを混線させずに切り分けること。

本書で扱わないこと。
- architecture / API責務の再定義
- 実装変更やテストコード変更
- Paste / D&Dと無関係な一般論としてのVSCode UX論評

Phase 5 E2Eは運用上、次の3分類で読み分けます。

- **Automated**: Extension Host APIレベルで自動確認できる事実。
- **Manual**: Preview / Problems / OSネイティブpaste / drag-and-dropなど、実機操作で最終確認すべき事実。
- **Known unstable**: 既知の不安定要因。失敗しても、直ちにPaste / D&D不具合と断定してはいけない事象。

以降の節は、再現手順・観測順・failure triageだけを改善対象とする という前提で読んでください。

## Scope lock from issue-0010 and architecture
Task 1 / Task 3の自己点検用に、本書が依拠する上流文書の責務をここで固定します。この節はarchitectureの境界を言い換えるためではなく、runbookが逸脱していないことを明示するためのガードレールです。

| Upstream source | Already fixed there | What this runbook is allowed to add | What this runbook must not redefine |
|---|---|---|---|
| `04_Documentation/history/issues/issue-0010-phase5-native-paste-drop-provider.md` Progress Notes | native provider / shared parsing / fallback behavior を proof boundary とし、manual E2E に native/fallback 比較順・known unstable 分離・failure triage を残すこと | Progress Notes にある manual 運用項目を、再実行可能な手順・表・ログテンプレートへ落とす | acceptance criteria 自体の変更、issue status の判定基準変更 |
| `02_Architecture/vscode-extension-host-e2e.md` automation boundary | canonical path / compatibility path / shared-logic boundary / known unstable separation | manual 観測順、host class ごとの first path / comparison path、failure 記録方法 | canonical path / compatibility path の意味、delegated manual scope の範囲 |
| `04_Documentation/developer-setup.md` setup boundary | 前提条件、実行入口、`xvfb-run` prerequisite の setup 導線 | setup 後にどの順で manual E2E を進めるか | OS セットアップ手順の正本化、architecture handoff の再定義 |

### Boundary shorthand used in this runbook
- **manual scope**: Preview DOM / Problems UI / suggest widget / OS native paste-dropの最終観測順と記録方法。
- **automation scope**: `npm run test:e2e` が先に保証するproof boundaryの読み方。
- **boundary rule**: automationとmanualの境界線はarchitectureが固定済みで、本書はその境界線の渡り方だけを説明します。

## Overview
Markdown Matrix Injectorでは、Dockerコンテナ内でもVSCode Extension Hostを起動した自動検証を行えます。現在のPhase 5 E2Eでは、実際のVSCodeエンジン上で次の5系統を確認します。

- `markdownMatrixInjector.renderEmbedForTest` によるHTML生成。
- Markdown補完 (`![[` → filepath / `#` → sheet / `?` → query parameter)。
- Problemsパネル相当のDiagnostics生成（file not found / invalid XML / sheet not found）。
- Paste / D&Dの command fallback によるMarkdown挿入。
- native paste / native drop provider が利用可能なhost上で、DataTransfer adapterがembed記法を返せること。

ただし、自動E2Eは Extension Host APIレベル の事実確認に留まります。次の項目はmanual E2Eで補完してください。

- Markdown Preview / Webview DOM上で、実際に `table` / card / error UIが見えているか。
- ProblemsパネルUIに、診断コード・メッセージ・対象行が期待どおり並ぶか。
- 補完UIが編集中のカーソル位置に追随し、候補のラベルや絞り込みが違和感なく見えるか。
- Paste / D&DがネイティブOSイベント経由でも実運用どおりに挿入されるか。
- native provider対応hostと非対応hostで、どちらの入口が使われたか。

## Prerequisites
- Node.js / npm
- `npm install` 済みであること
- `xvfb-run` が利用可能であること
- Electronが利用する基本ライブラリ群

## Required setup for `xvfb-run`
自動E2Eを実行する前に、必ず `xvfb-run` を導入して存在確認してから `npm run test:e2e` を叩いてください。issue-0010のExtension Host E2Eでは、この前提を省略してはいけません。

```bash
sudo apt-get update
sudo apt-get install -y \
  xvfb \
  libgtk-3-0 \
  libnss3 \
  libxss1 \
  libasound2t64 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2t64 \
  libgbm1 \
  libxshmfence1 \
  libx11-xcb1 \
  libxcb-dri3-0
xvfb-run --help
```

- `xvfb-run --help` が成功したら、仮想ディスプレイ前提は満たされています。
- ここで失敗する場合は、`npm run test:e2e` を実行せず、まずOSパッケージ導入を完了させてください。
- 2026-03-23のLinux container再検証では、`xvfb` 導入後も `libatk-1.0.so.0` 欠落でElectronが起動できなかったため、上記ライブラリ群を追加導入してからE2Eを再実行しました。
- Debian / Ubuntuの世代差によっては `libasound2t64` / `libcups2t64` が `libasound2` / `libcups2` に読み替わる場合があります。

## Commands
```bash
cd 03_Implement
npm install
npm run build
xvfb-run --help
npm run test:e2e
```

## Command alignment: automation vs manual handoff
issue-0010の運用では、automation scopeの確認 と manual scopeの観測 を同じrunbook上で扱います。ただし、両者の役割を混ぜないよう、次の順番でコマンド整合を確認してください。ここでのorderは xvfb-run prerequisite → automated proof boundary → manual comparison path → keyword audit の順に固定します。

| Order | Purpose | Command / action | Notes |
|---|---|---|---|
| 1 | headless prerequisite を先に固定する | `xvfb-run --help` | failure 時は automation blocked。native/fallback triage に進まない。 |
| 2 | 拡張バンドルを最新化する | `cd 03_Implement && npm run build` | manual E2E 開始前の前提。Development Host 起動前に実行する。 |
| 3 | Extension Host 自動確認を回す | `cd 03_Implement && npm run test:e2e` | automation scope の事実確認。native provider adapter / fallback command / diagnostics / completion API の境界を確認する。 |
| 4 | Development Host で manual E2E を始める | `F5` で `Run Extension` | OS native paste/drop, Preview DOM, Problems UI, suggest widget は manual scope。 |
| 5 | 文書更新後のキーワード監査を行う | `rg -n "native|fallback|Known unstable|autocomplete|Paste / D&D|DataTransfer|xvfb-run" 02_Architecture/vscode-extension-host-e2e.md 04_Documentation/vscode-e2e-testing.md 04_Documentation/developer-setup.md` | architecture / runbook / setup の語彙と運用導線が一致しているかを確認する。 |

Interpretation rule
- `npm run build` が通っていても、manual E2Eの観測順までは保証しません。
- `npm run test:e2e` が通っていても、OSネイティブpaste / dropの最終UXは保証しません。
- manual E2Eでnative pathだけ失敗しても、`npm run test:e2e` 側でfallbackとshared logicが成立していれば、まずhost capability差として読みます。
- `#` 補完だけ不安定な場合は、上記どちらの結果にも自動的に連座させず、Known unstableとして別管理します。

## What `npm run test:e2e` does
1. `npm run build` でExtension Host用のテストバンドルを生成する。
2. `scripts/run-vscode-e2e.sh` が `xvfb-run` の有無を確認し、不足時は `sudo apt-get update && sudo apt-get install -y xvfb` → `xvfb-run --help` → `cd 03_Implement && npm run test:e2e` の順で再実行する手順をエラーメッセージとして案内する。
3. `runTest.ts` がfixture workspaceを一時ディレクトリへ複製し、Diagnostics用の `invalid.xml` を追加する。
4. `@vscode/test-electron` がVSCodeを取得し、開発中の拡張を読み込んだExtension Hostを立ち上げる。
5. `test/e2e/suite/extensionHost.test.ts` が次の通し確認を順に実行する。
   - `render-command`: テストコマンド (`renderEmbedForTest`) によるtable/card描画確認。
   - `markdown-preview-entry` (ADR-0010 G1): 本番プレビュー入口 `extendMarkdownIt` を実ホスト上で呼び出し、`![[...]]` が `<figure class="mmi-embed">` / `<table class="mmi-table">` を含むblock-level HTMLを出力し、`<p>` ラッパーを生じないことを確認する。
   - `paste-drop-observation` / `paste-drop-boundary`: native provider adapter / fallback commandの確認。
   - `autocomplete-boundary`: 補完候補の確認（既知不安定あり）。
   - `diagnostics`: Diagnosticsの確認。

## First triage when `npm run test:e2e` fails
`npm run test:e2e` が失敗したら、native/fallbackの議論に入る前に 次の順で切り分けてください。次エージェントはこの順番を崩さないでください。

1. Headless prerequisiteを確認する
   - `xvfb-run --help` が通るか。
   - 通らないならfirst triageの結論は 環境未充足 です。`xvfb` 導入を先に済ませ、provider triageへ進まないでください。
2. Extension Host起動まで進んだかを見る
   - VSCodeダウンロード失敗、Electron起動失敗、共有ライブラリ不足、ネットワーク失敗のどれかをログで確認する。
   - ここで止まっている場合、native provider / fallback commandの成否はまだ未観測です。
3. 失敗箇所を3系統へ分類する
   - completion / known unstable
   - diagnostics / render
   - Paste / D&D native-fallback boundary
4. Paste / D&D系ならcomparison ruleで読む
   - fallback command assertionも落ちているか。落ちていれば共通解析またはfixture条件を先に疑う。
   - native adapter観測だけが落ちているならhost capability差またはnative surface側を優先する。
5. `Expected sheet completion after #.` 系ならKnown unstableへ分離する
   - filepath補完とquery parameter補完が同じrunで生きているか先に確認する。
   - `#` 段だけなら、Paste / D&Dの退行とは別チケット候補として扱う。

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
- **`markdown-preview-entry` (ADR-0010 G1)**: 本番プレビュー入口 `extendMarkdownIt` をExtension Host上で呼び出し、`![[...]]` が `<figure class="mmi-embed">` / `<table class="mmi-table">` / mmi-* クラス / `data-page-break` / `data-orientation` を持つblock-level HTMLを出力し、`<p>` ラッパーを生じないことを確認する。
- `renderEmbedForTest` がtable/cardの既存レンダリングを返す。
- `vscode.executeCompletionItemProvider` 経由でfilepath / sheet / query parameterの候補が取得できる。
- Markdown文書上で `MMI_FILE_NOT_FOUND`, `MMI_INVALID_XML`, `MMI_SHEET_NOT_FOUND` がDiagnosticsとして取得できる。
- `markdownMatrixInjector.insertEmbedFromPaste` / `markdownMatrixInjector.insertEmbedFromDrop` が、native provider非対応hostでも利用できる command fallback としてembed記法を挿入できる。
- `markdownMatrixInjector.__test.getPasteInsertTextFromDataTransfer` / `markdownMatrixInjector.__test.getDropInsertTextFromDataTransfer` が、native providerと同じDataTransfer解析結果を返す。
- 実行中hostが `registerDocumentPasteEditProvider` / `registerDocumentDropEditProvider` を公開している場合、そのAPI surfaceが存在することを確認する。
- `test:e2e:coauthoring`（実Excel＋実VS Code）で、Excelが保存したブックに対する `x-below` の判定をDiagnosticsとして確認する。記録と現在の状態が一致していれば無言、範囲の中に行を挿入して記録より増えれば警告、記録の無い参照は無言、範囲の下の行が減れば情報（警告にしない）。Excelの操作はCOM（非表示）で行い、人が保存した状態と同じ経路を通す。
- `test:e2e:import` で、取り込みが作る参照のテキスト（`&x-below=0` を含む）を確認する。

### What automation does not prove
自動E2Eが直接保証しない事項は、次のとおりです。

- Preview / Webview DOMの視覚（スクリーンショット。HTML構造・クラス・属性は `markdown-preview-entry` stageで自動確認済み）。
- Problemsビューの配置、視認性、クリック遷移の体験。
- Suggest widgetの表示位置や操作感。
- OSネイティブのclipboard event / drop eventからeditor editまでの最終経路。
- hostごとにnative pathが本当に選択されたかどうかのUXレベルの観察結果。
- PDF/印刷での改ページ・用紙向き・別紙参照の最終視覚確認（Checklist F / G2参照）。

### MMI固有のmanual確認は提示層だけ
`mmi check` / `mmi render` / `mmi select` は、VS Codeと**同じ共通Core**を通ります（Diagnosticsの生成、プレビューのmarkdown-itプラグイン、参照の作成）。したがって、診断の内容、プレビューのHTML、参照に記録される値は、実機の前にCLIで確認できます。実機のmanual E2Eに残すのは提示層だけです。

| 確認項目 | CLIで確かめられるか | 自動E2Eで確かめられるか（レーン名） | 人が実機で確かめる |
|---|---|---|---|
| 診断の内容（コード・メッセージ・重要度） | `mmi check`（同じCore） | `test:e2e:coauthoring`（`MMI_BELOW_MISMATCH` の重要度まで） | 不要 |
| プレビューのHTML（table/card/errorクラス、`data-page-break` 等） | `mmi render` | `markdown-preview-entry` | 不要 |
| 参照に記録される値（`x-below`、`x-headers` 等） | `mmi select` | `test:e2e:import`（`&x-below=0` を含む参照テキスト） | 不要 |
| Problemsパネルの見え方・並び・行ジャンプ・クリック遷移 | なし | なし（`getDiagnostics` の内容のみ） | Checklist B |
| ホバーの見え方と、電球メニューに修正候補が出るかどうか（カーソル行では出ない） | なし | なし | Checklist B（#579） |
| プレビューのCSSと、Obsidian系の埋め込み記法を独自に解釈する他のプレビュー拡張との競合（MPEのD1） | なし（描画経路は同じだが、拡張の独自解釈はVS Code側） | なし | Checklist A |
| 貼り付け / ドラッグ&ドロップのOS経路 | なし | なし（native providerのDataTransfer解析は自動、OS eventは未） | Checklist D / E |
| レビューUI | なし | なし | Checklist D / E |
| PDF/印刷での改ページ・用紙向き・別紙参照の最終視覚確認 | `mmi render --to html`（構造のみ） | なし（G2） | Checklist F |

上の表で「人が実機で確かめる」が空でない行だけが、実機のmanual確認に残ります。Problemsパネル・Suggest widget・OS native paste/dropの一般論は、[Why manual E2E is still required](#why-manual-e2e-is-still-required) の表にまとめています。

新しい振る舞いを足すときは、先にCLIで観測できる形か、純関数のヘッドレステストを用意し、実機で見る項目を提示層に限ってからmanual確認へ進みます。この割り当て表は #580 で作ったものです。

## Native provider and fallback policy
この節が、issue-0010に対する文書上の正本です。Paste / D&Dの責務を native path と fallback path に分けて解釈してください。

### Native path: canonical entry point
- 正規入口はVSCodeのnative provider APIです。
  - `registerDocumentPasteEditProvider`
  - `registerDocumentDropEditProvider`
- native provider対応hostでは、Pasteは通常の `Ctrl+V` / `Cmd+V`、D&Dは通常のドラッグ&ドロップを第一観測対象とします。
- 自動E2Eはproviderのedit適用までを直接再現するのではなく、providerが再利用するDataTransfer解析ロジックを `__test.getPasteInsertTextFromDataTransfer` / `__test.getDropInsertTextFromDataTransfer` 経由で検証します。
- したがって自動E2Eが保証するのは、「native providerが依存する解析ロジックは正しい」 こと、および 「hostがprovider APIを持っているか確認できる」 ことまでです。

### Fallback path: explicit command fallback for unsupported hosts
- `markdownMatrixInjector.insertEmbedFromPaste` と `markdownMatrixInjector.insertEmbedFromDrop` は、native provider非対応host向けの明示的fallback として維持されます。
- fallback commandはnative providerと同じ解析ロジックを再利用します。HTML clipboard解析やdropped file解析を二重実装するものではありません。
- そのため、fallback commandが成功しnative pathだけ失敗する 場合は、まずhost capability / OS event / DataTransfer payloadの差を疑ってください。
- 逆に、native pathとfallback pathの両方が失敗する 場合は、provider登録可否ではなく解析ロジックまたは入力データ自体の問題を優先的に疑います。

### Host matrix: what to run first on each host
次エージェントが迷わないよう、hostの種類ごとの観測順序を固定します。観測開始順はacceptance criteriaの切り分け順そのもの であり、manual E2Eでも崩さないでください。native provider対応可否を最初に固定し、次にfirst pathとcomparison pathを必ず1セットで実施します。

| Host class | Capability expectation | First path | Comparison path | Separate triage | この host で確定したいこと |
|---|---|---|---|---|---|
| native provider 対応 host | `registerDocumentPasteEditProvider` / `registerDocumentDropEditProvider` が available | 通常の `Ctrl+V` / `Cmd+V`、通常の drag-and-drop | `markdownMatrixInjector.insertEmbedFromPaste` / `markdownMatrixInjector.insertEmbedFromDrop` | `#` 補完は別欄へ分離 | native path が canonical entry として観測でき、fallback と結果差がないこと |
| native provider 非対応 host | provider API unavailable、または host 制約で native path 不可 | `markdownMatrixInjector.insertEmbedFromPaste` / `markdownMatrixInjector.insertEmbedFromDrop` | 通常貼り付け / 通常 drop は参考観測 | `#` 補完は別欄へ分離 | fallback が unsupported host 向け compatibility path として成立すること |
| capability 未確定 host | provider API の有無をまだ確認していない | `markdownMatrixInjector.insertEmbedFromPaste` / `markdownMatrixInjector.insertEmbedFromDrop` | その直後に native path | `#` 補完は別欄へ分離 | まず fallback baseline を作り、native-only 障害か共通障害かを分離すること |

Decision rule
1. **native provider対応host**: native → fallback → separate triageの順で閉じる。
2. **native provider非対応host**: fallbackを正規入口として扱い、nativeは参考観測に留める。
3. **capability未確定host**: まずfallbackを通し、次にnativeを試し、その差分からcapability問題か共通処理問題かを判定する。
4. どのhost classでも 比較入口を未実行のまま完了扱いにしない。issue-0010のfallback方針をtraceするため、native/fallbackの比較記録が必要です。
5. capability未確定hostでは、fallback baselineを先に確立してからnativeを試す。これにより、native only failureとshared parser failureを誤読しません。

### Host-class completion rule
host classごとの完了判定も固定します。first path / comparison path / separate triage の3点が揃うまで、manual E2EをDone扱いにしないでください。

| Host class | First path 完了条件 | Comparison path 完了条件 | Separate triage 完了条件 | この host class で言ってよい結論 |
|---|---|---|---|---|
| native provider 対応 host | 通常 paste / 通常 drop のどちらも 1 回以上記録済み | fallback paste / fallback drop のどちらも同一入力で 1 回以上比較済み | autocomplete を Paste / D&D と別欄で記録済み | native path が canonical entry として観測でき、fallback との差分有無を説明できる |
| native provider 非対応 host | fallback paste / fallback drop を正規入口として 1 回以上記録済み | native path を参考観測として試すか、「未対応のため参考観測のみ」と理由付きで明記済み | autocomplete を別トラック化し、native 非対応と混同していない | fallback が compatibility path として成立し、native 不在を parser 障害へ誤変換していない |
| capability 未確定 host | fallback paste / fallback drop を baseline として 1 回以上記録済み | その直後に native path を同一入力で比較済み | autocomplete を別欄化し、capability 差と known unstable を切り分け済み | native-only failure か共通解析 failure かを区別でき、host class を最終的に更新できる |

### Practical boundary: what next agents should conclude
この節は failure triageの短縮版 です。次の3パターンを先に読めば、manual E2Eのconclusionを誤読しにくくなります。

| Observed result | First reading | ここで確定してよいこと | ここで確定してはいけないこと |
|---|---|---|---|
| native Fail / fallback Pass | native surface または host capability 差 | fallback policy は成立している | shared parser 全体が壊れた、とは言わない |
| native Fail / fallback Fail | shared parser / payload issue | native only failure ではない | native provider 非対応だけで説明しない |
| autocomplete `#` only Fail | Known unstable separate triage | Paste / D&D と別トラックで管理する | Paste / Drop も壊れている、と連座させない |

補足は次のとおりです。
- **AutomatedでPass**: 解析ロジックとfallback commandは少なくともExtension Hostレベルで成立している。manualはその上にUX / host差分を観測するhandoff先です。
- **`xvfb-run` 未導入でautomation未実施**: provider failureではなくentry condition未充足。manual scope onlyのrunとして記録し、automation handoffは保留にする。

### Acceptance-to-runbook mapping
このrunbookでは、issue-0010のacceptanceとProgress Notesを次の5つの運用正本に固定します。

| Concern | Operational source of truth | First question | Escalation boundary |
|---|---|---|---|
| native provider が canonical path | native path を first path として観測する | host は native provider 対応か | native only failure なら host capability / OS event を疑う |
| fallback command が unsupported host 向け compatibility path | fallback path を comparison または first path として必ず観測する | fallback は同一入力で成功するか | fallback も失敗したら shared parser / payload を疑う |
| shared logic 再利用方針 | native / fallback の両方で DataTransfer 起点の同一解釈を確認する | 両経路の挿入結果はどこまで一致するか | 解析差分は provider 可否ではなく shared logic 側で追う |
| `xvfb-run` 前提と manual/automation handoff | headless prerequisite を最初に確認する | Extension Host を起動する前提は満たされているか | 欠落時は automation blocked、manual は別記録 |
| autocomplete Known unstable の分離 | `#` 補完 failure を Paste / D&D から独立管理する | filepath / query は生きているか | `#` だけ失敗なら Known unstable として閉じる |

## Observation order contract
manual E2Eの観測順序は次の契約で固定します。次エージェントはhostごとの例外運用を考えず、この順で進めてください。

1. **Capability record**: host classとprovider availabilityを最初に確定または暫定記録する。
2. **Baseline UI**: Preview → Problems → Autocompleteの順で、Paste / Drop実行前の基準状態を記録する。
3. **First path**: host classに応じた初手を1回だけ先に試す。
4. **Comparison path**: 直後にもう一方の入口を同一入力で実施し、差分を記録する。
5. **Separate triage**: autocompleteの既知不安定は最後に独立判定し、Paste / Drop結果へ混ぜない。

このcontractにより、native provider host / fallback only host / capability未確定hostのどれでも、「どの入口から観測を始めたか」 と 「比較対象を実行済みか」 を必ず残せます。

## Stream A integration points reflected in E2E
- Activation: `onLanguage:markdown` と各command activationを前提に、Markdown文書を開いてExtension Hostを有効化する。
- Commands:
  - `markdownMatrixInjector.renderEmbedForTest`
  - `markdownMatrixInjector.insertEmbedFromPaste`
  - `markdownMatrixInjector.insertEmbedFromDrop`
- Manual reproduction path:
  1. Markdownファイルを開く。
  2. `![[` を入力して補完候補を確認する。
  3. 存在しないファイル / シート / invalid XMLを書いてProblemsを確認する。
  4. native paste / dropを試し、その後に比較対象としてPaste / Drop入口コマンドを実行する。

## Manual E2E structure
以下は 自動E2Eの対象外だが、実運用では重要 な確認項目です。次エージェントが文書だけで再現できるよう、先に境界を固定します。

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
1. ホストOSのVSCodeでリポジトリ `/workspace/markdown-matrix-injector` を開く。
2. ターミナルで `cd 03_Implement && npm install && npm run build` を実行し、拡張のビルドを最新化する。
3. VSCodeで `03_Implement` フォルダを基準に `.vscode/launch.json` の `Run Extension` 構成を選び、`F5` でExtension Development Hostを起動する。
4. Development Host側で `File > Open Folder...` から `03_Implement/test/fixtures/workspace` を開く。
5. Explorerに `docs/phase5-preview-manual.md` が無ければ新規作成し、以下の確認用Markdownを貼り付けて保存する。

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
manual E2E自体はGUIを開けるhostで進められますが、issue-0010のacceptance traceでは automation scopeの未実施理由を先に固定 してからmanual scopeに進んでください。

1. `xvfb-run --help` を実行する。
2. 通らない場合は、automation scopeの結論を `xvfb-run` 未導入によるheadless prerequisite未充足 と記録する。
3. その状態では `npm run test:e2e` をprovider failureと読まない。まず `sudo apt-get update && sudo apt-get install -y xvfb` を案内し、導入後に `xvfb-run --help` を再確認する。
4. どうしても当該hostで `xvfb-run` を入れられない場合は、manual E2Eを続行してよいが、結果ログに 「manual scope only / automation blocked by missing xvfb-run」 と明記する。
5. つまり `xvfb-run` 未導入は 環境未充足 であり、native provider / fallback / DataTransfer triageに入る前段の停止条件です。

## Manual execution order (run this top to bottom)
比較観測の順番を固定します。native path / fallback path / known unstable を混同しないため、必ず次の順に進めてください。ここでの順序はissue-0010の未完了条件である manual E2Eによるfallback方針の明示 と native/fallback境界の運用再現 に直接対応します。

1. Setupを完了する
   - Manual environment setupの手順どおりDevelopment Hostを起動する。
   - 比較用Markdown (`phase5-preview-manual.md`) を保存した状態にする。
   - 入力元アプリ候補（Excel / Google Sheets / ブラウザtable / Explorer上のCSVなど）を準備しておく。
2. Capabilityを先に記録する
   - VSCode version、OS、Development Host / 通常ホストのどちらかをメモする。
   - `registerDocumentPasteEditProvider` / `registerDocumentDropEditProvider` がavailableかunavailableかunconfirmedかを最初に書く。
   - 未確定なら「何を根拠に未確定としたか」も1行残す。
3. Preview / Problems / autocompleteを先に確認する
   - Checklist A → Checklist B → Checklist Cの順に実施する。
   - この順番にしておくと、Paste / D&Dで本文が変化しても基準状態を失わない。
4. Pasteはhost classに応じた初手で開始する
   - capability未確定hostとnative provider非対応hostでは、`markdownMatrixInjector.insertEmbedFromPaste` を先に実行する。
   - native provider対応hostでは、通常pasteを先に観測してからfallback commandを比較実行する。
   - 1回目実行前に、貼り付け位置とクリップボード元アプリをログへ書く。
5. Dropも同じ順序で比較する
   - capability未確定hostとnative provider非対応hostでは、`markdownMatrixInjector.insertEmbedFromDrop` を先に実行する。
   - native provider対応hostでは、通常dropを先に観測してからfallback commandを比較実行する。
   - 1回目実行前に、ドロップ元ファイル名と単一/複数ファイル条件をログへ書く。
6. Autocompleteの失敗は最後に独立判定する
   - `#` 直後だけ候補0件のときはKnown unstableとしてseparate logに分ける。
   - Paste / D&Dの成否判定には混ぜない。
7. Result logを埋めてacceptance criteriaへ結びつける
   - native provider対応可否、fallback成立可否、known unstableの有無をそれぞれ別欄で記録する。
   - これによりissue-0010の「native provider surface」「fallback方針」「manual E2E再現性」を1回の手順でtraceできる。

### Manual execution quick map by host class
次エージェントがhost classごとのfirst moveを即決できるよう、manual E2Eの開始順を簡略表でも固定します。読む順はFirst path → Comparison path → Separate triageの3列です。

| Host class | Baseline before Paste / D&D | First path | Comparison path | Separate triage | First conclusion | Completion gate |
|---|---|---|---|---|---|---|
| native provider 対応 host | Preview → Problems → Autocomplete | 通常 paste / 通常 drop | fallback command | autocomplete を別欄へ記録 | native path が canonical に動くか | native/fallback の両経路記録 + autocomplete 分離記録 |
| native provider 非対応 host | Preview → Problems → Autocomplete | fallback command | 通常 paste / 通常 drop は参考観測 | autocomplete を別欄へ記録 | fallback 方針が運用上成立するか | fallback 成功記録 + native 参考観測理由 + autocomplete 分離記録 |
| capability 未確定 host | Preview → Problems → Autocomplete | fallback command | 通常 paste / 通常 drop | autocomplete を別欄へ記録 | native-only failure か共通 failure か | fallback baseline + native comparison + host class 更新記録 |

この簡略表は `Host matrix` の運用版です。判定に迷った場合は、「未確定hostでは先にfallback」 を優先し、その直後にcomparison pathを同一入力で実施してください。

### Separate triage quick runbook
Paste / D&DとKnown unstableを混線させないため、最後の判定だけを1表に圧縮します。native only failure と shared parser failure を読み違えないための最短表でもあります。

| Observed combination | まず付けるラベル | 先に閉じてよい範囲 | 追加で残すべき記録 |
|---|---|---|---|
| native Pass / fallback Pass / autocomplete Fail(`#` only) | Known unstable separate | Paste / D&D は Pass 扱い可 | `#` 補完のみ別欄へ記録 |
| native Fail / fallback Pass | host capability or native path issue | fallback policy 成立まで | OS、VSCode version、入力元アプリ or dropped file |
| native Fail / fallback Fail | shared parser or payload issue | host capability 問題だけでは閉じない。共通解析 failure として扱う | DataTransfer / clipboard / dropped payload 条件 |
| autocomplete `#` only Fail | Known unstable separate | Paste / D&D 判定へ混ぜない | filepath / `?` 補完が生きていたか |
| `xvfb-run` missing | environment prerequisite missing | automation blocked まで | `xvfb-run --help` の結果と manual-only 実施有無 |

## Checklist A: Markdown Preview / Preview DOM
**Classification**: Manual  
**目的**: Preview DOMは自動E2E未対象なので、Preview上の見た目とエラー表示を確認する。

### Steps
1. エディタで `phase5-preview-manual.md` を開き、`Markdown: Open Preview to the Side` を実行する。
2. `Valid table` セクションで、表が2列以上のHTML tableとして表示されることを確認する。
3. `Missing file` / `Missing sheet` / `Invalid xml` の各セクションで、壊れた空白ではなく、埋め込み失敗が分かるエラー表示または代替UIが描画されることを確認する。
4. Previewをスクロールし、表やエラーUIが極端に重ならないこと、Markdown見出しとの順序が崩れないことを確認する。

### Observation points
- `Valid table` はheader行とdata行の区別が見えるか。
- エラー系3件は空白ではなく、失敗種別が推測できるUIになっているか。
- Preview側の表示順がエディタ本文の順番と一致しているか。

### Expected results
- `Valid table` は、少なくとも1行以上のデータを含む表として視認できる。
- エラー系3件はPreview上で「何が壊れたか分からない空白」ではなく、失敗が分かる表示になる。
- Previewとエディタ本文の順序が一致し、対象embedの前後が入れ替わらない。

### Failure hints
- Previewが更新されない場合はMarkdownファイル保存後に `Developer: Reload Window` を試す。
- 全embedが素のテキストのままなら、Development Host側で拡張が有効になっているか確認する。
- `invalid.xml` だけ無反応の場合は、手動作成したXMLがfixtureに保存されているか確認する。

## Checklist B: Problems パネル / Diagnostics visibility
**Classification**: Manual  
**目的**: Diagnostics自体は自動化済みだが、Problemsパネルの視認性・対象行・コード確認は手動で行う。

### Steps
1. `phase5-preview-manual.md` を保存した状態で、`View: Problems` を開く。
2. フィルタを解除し、`phase5-preview-manual.md` に紐づく問題だけを確認する。
3. 次の3件がErrorとして表示されることを確認する。
   - file not found
   - invalid XML
   - sheet not found
4. 各項目をクリックし、エディタカーソルが該当embed行へジャンプすることを確認する。
5. 可能ならProblemsの詳細表示またはHoverで、診断コードが `MMI_FILE_NOT_FOUND` / `MMI_INVALID_XML` / `MMI_SHEET_NOT_FOUND` と読み取れることを確認する。

### Observation points
- 件数が常に3件に保たれるか。
- 行ジャンプ先がembed行と一致するか。
- コード表示がメッセージだけでなく識別子レベルで区別できるか。

### Expected results
- Problemsパネルに3件だけ並び、保存のたびに重複して増殖しない。
- 各問題が該当embedの行へナビゲートできる。
- メッセージだけでなく、どの種別の壊れ方か判別できる表示になっている。

### Failure hints
- Problemsが0件ならMarkdownファイルとして開いているか、保存済みかを確認する。
- 件数が増え続ける場合はDiagnosticCollectionの消し込み不全を疑い、再読み込み後も再現するか記録する。
- 行ジャンプがずれる場合はembed記法の範囲計算ずれとして、実際に飛んだ行番号を記録する。

## Checklist C: Autocomplete UI
**Classification**: Manual / Known unstable-aware  
**目的**: 補完候補の中身だけでなく、補完ウィジェットの見え方と挿入後の本文変化を確認する。

### Steps
1. `phase5-preview-manual.md` の末尾に新しい行を作る。
2. `![[` と入力し、必要なら `Ctrl+Space` / `Cmd+Space` で補完を開く。
3. filepath候補に `data/sample.csv` などworkspace内パス候補が出ることを確認する。
4. 候補を1件選択し、挿入後に `#` を入力する。
5. sheet/range候補が続けて表示されることを確認し、1件選択する。
6. 続けて `?` を入力し、`header=`, `mode=`, `columns=` などquery parameter候補が表示されることを確認する。
7. 補完を1つ確定し、最終的に `![[...#...?...]]` の形で本文へ挿入されることを確認する。
8. `#` 直後だけ候補が出ない場合でも、その場でPaste / D&D不具合へ昇格させず、Known unstable用の記録欄へ分離する。

### Observation points
- filepath → sheet/range → query parameterの順で候補集合が切り替わるか。
- 候補確定後に記法の括弧や `#` / `?` の境界が壊れないか。
- `#` 直後だけ候補が消える場合、Paste / D&Dとは別の既知不安定として見分けられるか。

### Expected results
- `![[` 直後はfilepath候補、`#` 直後はsheet/range候補、`?` 直後はquery候補と、段階的に切り替わる。
- 候補選択後、既存文字列を壊さずembed記法の続きを自然に入力できる。
- 補完UIがカーソル近傍に表示され、候補0件なのに無言で閉じるような違和感がない。

### Failure hints
- 補完が出ない場合は言語モードがMarkdownか、カーソルが `![[`, `#`, `?` の直後かを確認する。
- filepath候補だけ出る場合はfixture workspaceを開いているか確認する。
- 候補確定後に括弧が壊れる場合は、どのトリガー文字で崩れたかを記録する。
- `#` 直後のsheet候補だけが0件でも、Paste / D&D回りの失敗とは混同しない。known unstableの節へ分離して記録する。
- 特に Paste / Dropをまだ試していない段階では、autocomplete Failureからprovider failureを推定しない。

## Checklist D: Paste comparison (native paste vs fallback paste)
**Classification**: Manual  
**目的**: native paste providerの経路とfallback commandの経路を比較し、どちらが利用されたか誤解なく記録する。

### Input conditions
| Item | Required condition |
|---|---|
| Editor state | `phase5-preview-manual.md` を開き、比較用の空行を 2 行以上確保していること |
| Clipboard source | Excel / Google Sheets / HTML table をコピーできるアプリを 1 つ固定すること |
| Comparison rule | 1 回目と 2 回目で **同じ表データ** を使うこと |
| Host log | host class と provider availability を先に記録していること |

### Steps
1. OS上でExcel / Google Sheets / 表計算ソフト、またはHTML tableをコピーできるブラウザを準備する。
2. その表をコピーし、Development HostのMarkdownエディタへ戻る。
3. host classに応じて開始入口を選ぶ。
   - native provider対応host: 新しい行で `Ctrl+V` / `Cmd+V` を先に実行する。
   - native provider非対応hostまたはcapability未確定host: `markdownMatrixInjector.insertEmbedFromPaste` を先に実行する。
4. 1回目の結果を保存し、続けて比較対象のもう一方の入口も必ず実行する。
5. `Editor: Paste As...` のようなVSCode側UIを経由した場合は、それも別列で記録する。
6. 挿入結果の差分を見て、native path / fallback path / 入力元アプリ差のどれが主要因かを判定する。
7. 結果をFailure log templateまたはSummary tableに転記する。

### Observation points
- native pasteとfallback commandで、挿入された `![[...]]` の文字列差があるか。
- 何も変換されなかった場合、そのときclipboard元アプリとhost capabilityは何か。
- 1回目と2回目で同じ入力を使ったか。

### Expected results
- native provider対応hostでは、通常の貼り付け操作だけでベストエフォートの `![[...]]` 形式embedまたはそれに準ずる提案結果が挿入される。
- native provider非対応hostでは、通常貼り付けで変換されない代わりに `markdownMatrixInjector.insertEmbedFromPaste` を使って同等のembedを再現できる。
- 挿入直後にMarkdownが壊れず、少なくとも1行の有効なembed記法として残る。
- 期待どおりの変換ができない場合も、無言失敗ではなく「何も変換されなかった」事実を記録できる。

### How to read failures
- **native paste Fail / fallback paste Pass**: native provider未対応host、またはhost側制約を優先的に疑う。issue-0010の受入条件上は fallback方針が成立している ので、manual E2Eではhost classと入力元アプリを明記してクローズできる。
- **native paste Fail / fallback paste Fail**: 共通解析ロジックまたは入力元HTML metadataを疑う。issue-0010のfallback境界だけでは説明できないため、Paste / D&D共通障害として扱う。
- **native paste Pass / fallback未実行**: 記録不足。比較対象としてfallbackも少なくとも1回は実行する。
- **autocompleteも同時Fail**: 直ちにPaste不具合へ統合しない。まずKnown unstable手順で `#` 補完だけの障害かを分離する。

### Failure hints
- OS/ブラウザ差でclipboard HTMLが取得できないことがあるため、利用したアプリ名とOSを必ず記録する。
- 通常貼り付けで何も起きない場合は、hostがnative paste provider非対応か、clipboardのHTMLメタデータが不足しているかを切り分ける。
- fallback commandでは成功する場合、native provider未対応またはhost側制約の可能性が高い。
- 文字化けや複数行崩れがあれば、貼り付け前後の本文差分を残す。
- autocompleteが同じrunで失敗していても、Paste failure欄の結論はnative/fallback比較結果だけで書く。

## Checklist E: Drag & Drop comparison (native drop vs fallback drop)
**Classification**: Manual  
**目的**: native drop providerとfallback drop commandの差分を同じ入力条件で確認する。

### Input conditions
| Item | Required condition |
|---|---|
| Editor state | `phase5-preview-manual.md` を開き、drop 比較用の空行を 2 行以上確保していること |
| Drop source | `sample.csv` など fixture 内の単一ファイルを最初の比較対象に固定すること |
| Comparison rule | 1 回目と 2 回目で **同じファイル** を使うこと |
| Host log | host class と provider availability を先に記録していること |

### Steps
1. ホストOSのファイルマネージャ、またはDevelopment HostのExplorerから `sample.csv` 等をつかめる状態にする。
2. host classに応じて開始入口を選ぶ。
   - native provider対応host: Markdownエディタ上の空行へCSV / XLSX / XMLファイルを通常ドロップする。
   - native provider非対応hostまたはcapability未確定host: まず `markdownMatrixInjector.insertEmbedFromDrop` を実行する。
3. 1回目の結果を保存し、続けて比較対象のもう一方の入口も必ず実行する。
4. 複数ファイルを同時にドロップできる環境なら、単一ファイル時との差も確認する。
5. 挿入結果の差分を見て、native path / fallback path / dropped payload差のどれが主要因かを判定する。
6. 結果をFailure log templateまたはSummary tableに転記する。

### Observation points
- native dropとfallback commandで、相対/絶対パスやシート補完の差が出るか。
- 無変化だった場合、それがnativeだけか両方か。
- 単一ファイルと複数ファイルで結果差があるか。

### Expected results
- native drop provider対応hostでは、少なくとも単一ファイルのドロップで `![[...]]` 記法が1つ挿入される。
- native provider非対応hostでは、`markdownMatrixInjector.insertEmbedFromDrop` 実行で同等の挿入結果を再現できる。
- 挿入パスが絶対/相対のどちらになったかを確認し、次エージェントが再現できるよう記録できる。
- 未対応形式や複数ドロップ時は、落ちるのではなく「未変換」または既知制約として扱える。

### How to read failures
- **native drop Fail / fallback drop Pass**: native drop provider未対応host、またはhost側drop event制約を優先的に疑う。issue-0010の受入条件上は fallback方針が成立 しているため、manual E2Eではhost capabilityとdropped sourceを明記する。
- **native drop Fail / fallback drop Fail**: dropped file解析か入力payloadを優先的に疑う。fallback境界だけでは説明できない。
- **native drop Pass / fallback未実行**: 比較記録としては不十分。fallbackも最低1回実行する。
- **autocompleteも同時Fail**: Pasteと同様、drop failure判定へ混ぜずKnown unstable手順で分離する。

### Failure hints
- 通常ドロップで本文無変化なら、hostがnative drop provider非対応か、VSCode標準のファイル挿入と競合していないか確認する。
- fallback commandでは成功する場合、native drop provider未対応またはhost側制約として記録する。
- Development HostとホストVSCodeで挙動差がある場合は、どちらで再現したか明記する。
- 複数ファイル時に一部だけ入る場合は、順序と実際に入ったパスを記録する。
- autocompleteが同じrunで失敗していても、D&D failure欄の結論はnative/fallback比較結果だけで書く。

## Known unstable: autocomplete must be tracked separately
**Classification**: Known unstable

この節は Paste / D&D triageからautocompleteを切り離すための独立節 です。ここに該当したfailureは、Checklist D / Eの失敗件数へ混ぜません。

- headless VSCode 1.112系では、`vscode.executeCompletionItemProvider` によるsheet候補取得が0件になることがあります。
- 既存assertion `Expected sheet completion after #.` は、この既知不安定要因の影響を受ける場合があります。
- 現行テストは200ms間隔・最大15回の再試行に加え、最終的なcompletion state (`vscodeVersion`, `platform`, `DISPLAY`, `lineText`, `position`, `attempts`, `labels`) を警告ログへ残します。
- 切り分けの観点は次のとおりです。
  - filepath補完とquery parameter補完が同一実行で成功しているか。
  - `#` 直後だけlabelsがdocument wordsに寄るか / 空になるか。
- 後者なら、cursor positionやtrigger characterの全面故障ではなく、sheet metadata読み出しまたはheadless hostのsuggest挙動差を優先的に疑ってください。
- この不安定要因はissue-0010のnative provider変更とは独立に残っているため、autocompleteの失敗をPaste / D&Dの失敗と混同しない ことが重要です。

### Triage order for autocomplete vs Paste / D&D
autocompleteの失敗を見つけたときは、次の順で判断してください。

1. `![[` 直後のfilepath補完が出るか確認する。
2. `?` 直後のquery parameter補完が出るか確認する。
3. `#` 直後だけ失敗しているなら、まずKnown unstableとして記録する。
4. その状態でもPaste / D&Dのnative path / fallback pathは別チェックリストで独立に実施する。
5. 1〜4を満たしたうえで、Paste / D&Dも同じrunで壊れているなら、初めて「共通環境要因の可能性あり」と注記する。

### Fast triage table
| Symptom | First interpretation | Next action | Must not do |
|---|---|---|---|
| filepath 補完 OK / `?` 補完 OK / `#` 補完だけ NG | Known unstable の可能性が高い | Autocomplete 欄へ別記録し、Paste / D&D は予定どおり続行 | Paste / D&D 失敗と断定しない |
| Paste native NG / Paste fallback OK | native provider または host capability 差 | host class と clipboard source を記録する | autocomplete failure とまとめて 1 件化しない |
| Drop native NG / Drop fallback OK | native drop provider または host capability 差 | host class と dropped file を記録する | Paste failure と一括りにしない |
| Paste fallback NG / Drop fallback NG | 共通解析または入力条件の問題 | 入力データと payload を再確認する | native provider 非対応だけを原因にしない |

## Reproduction and failure isolation workflow
Paste / D&Dの不具合を切り分けるときは、必ず次の順番で確認してください。この節はNative provider and fallback policy / Known unstable / Failure log templateをつなぐ中核フロー です。

1. Host capabilityを記録する
   - Development Hostの `Developer: Toggle Developer Tools` やExtension Hostのログで、利用中VSCode versionを記録する。
   - `registerDocumentPasteEditProvider` / `registerDocumentDropEditProvider` が存在する前提のhostか、fallback only hostかを最初にメモする。
2. host classに応じてfirst pathを決める
   - native provider対応hostではnative pathをfirst pathにする。
   - fallback only host / capability未確定hostではfallback commandをfirst pathにする。
3. comparison pathを必ず同一入力で実施する
   - `markdownMatrixInjector.insertEmbedFromPaste` または `markdownMatrixInjector.insertEmbedFromDrop` を比較対象として実行し、native pathと同一入力で差分を取る。
   - fallbackが失敗する場合はnative providerではなく、解析ロジック全体または入力データの問題として扱う。
4. native pathだけ失敗した場合の結論を限定する
   - Pasteは `Ctrl+V` / `Cmd+V`、Dropは通常のドラッグ&ドロップで挿入を試す。
   - native pathだけ失敗する場合、host capability・OS・入力元アプリ・DataTransfer payload種別を記録し、「fallback方針は成立」までを結論 とする。
5. autocomplete失敗は別トラックに分離する
   - `Expected sheet completion after #.` 相当の失敗は、Paste / D&D回りと同一原因とみなさない。
   - 同一実行で併発しても、ログ上はautocompleteとpaste/dropを別項目に分ける。

### Runbook note: known unstable vs Paste / D&D regression
- Known unstable は `#` 補完の不安定性を指すラベルであり、native paste / native drop / fallback commandのpass-failを上書きしません。
- したがって `#` 補完failureを見つけても、Checklist D / Eをまだ実施していないなら Paste / D&D退行判定を保留 してください。
- 逆に、Paste / D&Dのnative/fallback比較が終わっているなら、autocompleteが同時失敗していても Paste / D&D欄の結論はnative/fallback比較結果だけで確定 して構いません。
- この順序を崩すと、issue-0010のacceptance criteriaにあるfallback方針の明示とKnown unstable分離が同時に壊れます。

## Recommended checklist summary
実地確認時は、少なくとも次の順番でチェックしてください。Failure triageとresult log templateがこの並びを前提にしているため、順序を入れ替えないでください。完了条件は「host classを固定し、first moveとcomparisonを同一入力で記録し、Known unstableを別欄へ分離した」状態です。

- [ ] Manual setupが完了している。
- [ ] Host capabilityを記録した。
- [ ] Checklist A: Preview DOMを確認した。
- [ ] Checklist B: Problemsパネルを確認した。
- [ ] Checklist C: autocompleteを確認した。
- [ ] native provider対応/非対応/未確定のどのhost classかを記録した。
- [ ] Checklist D: 1回目のPaste入口 をhost classに応じて選んだ。
- [ ] Checklist D: 比較対象のPaste入口 を追加実行した。
- [ ] Checklist E: 1回目のDrop入口 をhost classに応じて選んだ。
- [ ] Checklist E: 比較対象のDrop入口 を追加実行した。
- [ ] autocompleteの失敗有無をPaste / D&Dと分離して記録した。
- [ ] Failure log templateに結果を転記した。
- [ ] manual runbookの完了条件を満たしたと短く要約できる。

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
- Native provider and fallback policy を読むと、host classごとのfirst path / comparison pathが分かります。
- Known unstable を読むと、autocomplete failureをPaste / D&Dから分離してよい条件が分かります。
- Reproduction and failure isolation workflow を読むと、上記2系統をどの順でresult log templateに落とすかが分かります。
- Suggested manual result log template / Failure log template は、issue-0010のacceptance criteriaのうち「fallback方針の明示」と「manual E2E再現性」の記録面を担当します。

## Host-class tracking sheet (minimum record)
first path / comparison path / separate triageをhost classごとに追跡しやすくするため、manual logの前に最低限この表を埋めてください。この表が埋まっていれば、known unstable autocompleteがPaste / D&D判定へ混入していないことを後から監査できます。

| Host class | First path (Paste / D&D) | Comparison path | Separate triage record | Required evidence |
|---|---|---|---|---|
| native provider 対応 host | native paste, native drop | fallback paste command, fallback drop command | autocomplete を別欄へ記録 | native/fallback の結果差 + host capability |
| native provider 非対応 host | fallback paste command, fallback drop command | native path は参考観測、または unavailable 理由を明記 | autocomplete を別欄へ記録 | fallback 成功 + native unavailable 根拠 |
| capability 未確定 host | fallback paste command, fallback drop command | 直後に native paste, native drop | autocomplete を別欄へ記録 | fallback baseline + native comparison + 更新後 host class |

## Acceptance and progress-note source-of-truth map
issue-0010のacceptance criteria / Progress Notesに対して、runbookでは次の節を運用正本とします。architecture境界の再定義は行わず、どの手順・表・判断基準で追跡するか だけを固定します。

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

1. native provider surfaceから発火できること
   - `Automated coverage`, `Native provider and fallback policy`, `Checklist D`, `Checklist E` でnative pathの観測点を保持する。
2. 既存解析ロジックを再利用し、二重実装しないこと
   - `Automated coverage`, `Native path`, `Fallback path` でDataTransfer解析ロジック再利用を明記する。
3. native provider非対応環境でfallback方針が明示されること
   - `Host matrix`, `Observation order contract`, `How to read failures`, `Reproduction and failure isolation workflow` でfallback only hostの運用を明文化する。
4. manual E2Eの再現性があること
   - `Manual environment setup`, `Manual execution order`, `Checklist A-E`, `Suggested manual result log template`, `Failure log template` で再現手順・比較順・失敗ログを固定する。
5. autocomplete known unstableを独立運用できること
   - `Checklist C`, `Known unstable`, `Fast triage table`, `Cross-reference map` でPaste / D&Dと混同しない導線を作る。

## Manual runbook completion rule (short summary)
manual runbookは、同じhost classで同じ比較順を再実行でき、native only failure / shared parser failure / Known unstableを別々に記録できる状態 になった時点で完了です。

## Boundary self-check before closing the document task
Task 3の自己点検として、文書更新後に次の4問へ すべてYes と答えられるか確認してください。

1. native / fallback / shared logic / known unstableの定義そのものを変更せず、観測順とtriage順だけを書いたか。
2. delegated manual scopeの具体化として、Preview DOM / Problems UI / suggest widget / OS native paste-dropの観測手順だけを追加したか。
3. `xvfb-run` prerequisiteをprovider/fallback failureと混同せず、entry conditionとして先に扱っているか。
4. host classごとのfirst path / comparison path / failure log templateが、automation scopeの再説明ではなくmanual runbookの再現性向上に使われているか。

上の4問のどれかがNoなら、本書はarchitectureの責務へ踏み込み過ぎています。文書を閉じる前に、その記述をrunbookの操作語彙へ戻してください。

## Keyword audit for issue-0010 operations
文書更新後は、少なくとも次のキーワードが欠けていないか `rg` で確認してください。

```bash
rg -n "native|fallback|manual|xvfb|autocomplete" 04_Documentation/vscode-e2e-testing.md 02_Architecture/vscode-extension-host-e2e.md
```

確認観点は次のとおりです。
- `native` と `fallback` がarchitectureとrunbookの両方で比較境界として現れているか。
- `manual` と `autocomplete` がdelegated manual scope / known unstable separationの文脈で残っているか。
- `xvfb` がprerequisite / triage / handoffのいずれかで明示されているか。

## Checklist F: Markdown Preview Rendering (G1 / ADR-0010)
**Classification**: Manual（HTML構造の正しさはautomation済み。視覚確認のみ手動）  
**目的**: `extendMarkdownIt`（本番プレビュー入口）が実VS Codeのプレビュー画面で正しく描画されることを、スクリーンショットで実証する（G1品質ゲートの最終確認）。

> 前置き: HTML 構造・クラス・属性・block 描画の正しさは unit test（167 件）と e2e `markdown-preview-entry` stage で自動確認済み。  
> 本 Checklist が追加で確認するのは「実画面で見たときに視覚的に壊れていないか」のみ。

### Steps
1. Manual environment setupを完了し、Extension Development Hostを起動する。
2. `03_Implement/test/fixtures/workspace/docs/` に以下の内容で `phase11-preview-g1.md` を作成・保存する。
   ```md
   # G1 プレビュー描画確認

   ## テーブル（カラム選択 + ハイライト）
   ![[../data/roles.csv#Sheet1|A1:B3?header=first&caption=ロール一覧&id=tbl-roles&highlightColumn=Role&highlightValue=Admin]]

   ## カード（Smart Fallback）
   ![[../data/wide.csv#Sheet1|A1:K2]]

   ## 改ページ + 横向き（印刷制御）
   ![[../data/roles.csv#Sheet1|A1:B3?header=first&caption=印刷制御テスト&id=tbl-print&pageBreak=before&orientation=landscape]]
   ```
3. `Markdown: Open Preview to the Side` でプレビューを開く。
4. 以下を目視確認しスクリーンショットを取得する（`04_Documentation/samples/screenshots/` へ保存）。

### Observation points
| 確認項目 | 期待する状態 | 失敗ヒント |
|---|---|---|
| テーブルが描画される | 2 列の `<table>` が見える（空白や `![[...]]` 生テキストではない） | 拡張が有効化されているか確認。Obsidian系の埋め込み記法を独自に解釈するプレビュー拡張（Markdown Preview Enhanced 等。`enableWikiLinkSyntax`）で開いていないか確認し、標準の `Markdown: Open Preview to the Side` を使う |
| caption が表示される | 「ロール一覧」が表の上に表示される | `mmi-embed__caption` CSS が適用されているか確認 |
| ハイライト行がある | Admin 行が他行より目立つ背景色になっている | `mmi-table__row--highlight` CSS が適用されているか確認 |
| カードが描画される | `wide.csv` がリンクカード UI として表示される（wide なため自動縮退） | smart fallback 条件を確認 |
| 段落内に block 混入なし | テーブル/カードが `<p>` タグ内に埋め込まれてプレビューが崩れない | block 描画バグの兆候 |
| スタイルが適用されている | テーブルに罫線・ハイライトが視認できる | `media/markdown-matrix.css` が preview styles として読み込まれているか確認 |
| カード見出しがリンクである | カードのファイル名クリックで参照先ファイルへ遷移できる（Strict/未信頼でも動作） | 相対パスの解決先を確認（issue-0100 / ADR-0011 baseline） |
| 「外部アプリで開く」が発火する | 信頼済みワークスペースでボタンクリックすると OS 既定アプリ（Excel 等）で正本が開く | 未信頼環境では発火しないのが正常（ADR-0011 の設計どおり）。Workspace Trust 状態を記録する |

### Expected results
- すべての `![[...]]` がテキストではなく、表またはカードUIとして描画される。
- `caption` / `id` / `highlight` / `pageBreak` / `orientation` の視覚効果が確認できる。
- `data-page-break="before"` / `data-orientation="landscape"` 指定のembedがプレビューで崩れない。
- 実画面のスクリーンショット（`.png`）を `04_Documentation/samples/screenshots/phase11-g1-preview.png` として保存する。

### G2 PDF 確認への接続
印刷制御（`pageBreak` / `orientation`）のPDF実証手順は `04_Documentation/samples/sier-design/README.md` の「G2: 実PDF生成」を参照してください。

---

## Future Playwright candidates
手動でしか確認しにくい項目のうち、将来Playwright化を検討する候補は次のとおりです。

1. Markdown Previewの `table`, `figcaption`, `mmi-card`, error UIのDOM存在確認。
2. Problemsパネルの件数表示、対象ファイル表示、クリック遷移のスモークテスト。
3. Suggest widgetの表示有無まではUI Automationで確認し、候補中身は既存APIテストを流用する。
4. Native paste/dropはOS依存が強いため、現行自動化はDataTransfer adapterとfallback commandまでを保証し、OSイベントからの最終挿入はmanual E2Eで確認する。

## Failure triage
- `xvfb-run is required ...` で失敗した場合: OSパッケージ `xvfb` を導入する。
- VSCodeダウンロードやElectron起動で失敗した場合: ネットワーク制約またはGUI依存ライブラリ不足を疑う。
- Completionが0件の場合: 対象文書がMarkdownとして開かれているか、カーソル位置が `![[`, `#`, `?` の直後かを確認する。特に `#` 直後のsheet候補0件は、headless VSCode 1.112系の既知不安定要因として別記録に切り出す。E2Eログには `vscodeVersion`, `platform`, `DISPLAY`, `lineText`, `position`, `attempts`, `labels` をJSONで出すようにしてあるため、まずfilepath / query parameter補完が同一実行で生きているかを見て、sheet段だけが欠落しているかを判定する。
- Diagnosticsが不足する場合: 一時workspaceの `data/invalid.xml` 作成と、対象Markdown文書保存内容を確認する。
- Paste / D&D挿入が失敗する場合: まずnative path失敗かfallback command失敗かを分離する。native pathだけ失敗するならhost capability / OS event / clipboard or drop payloadを確認し、fallbackも失敗するなら解析ロジック側を疑う。

## Known scope limits
- このE2EはExtension Host APIレベルの検証であり、Markdown Preview / WebviewのDOMまでは検査しません。
- native providerのedit適用はhost capabilityとOSイベントに依存するため、最終挿入結果はmanual E2Eで補完する必要があります。

## issue-0010 acceptance criteria coverage from documentation
本書がissue-0010のacceptance criteriaを文書面で補完する範囲を、短い対応表で固定します。

| Acceptance criteria / task | 本書で担保する節 | 要約 |
|---|---|---|
| native provider surface から発火できること | `Automated coverage`, `Checklist D`, `Checklist E` | native path を自動確認の境界と manual 観測手順の両方で追跡する。 |
| 既存解析ロジックを再利用し二重実装しないこと | `Automated coverage`, `Native provider and fallback policy` | native / fallback が同じ DataTransfer 解析ロジックを共有する前提を明示する。 |
| native provider 非対応 host の fallback 方針が明示されていること | `Host matrix`, `Manual execution quick map by host class`, `Failure triage` | fallback only host の first move・comparison・結論範囲を固定する。 |
| Extension Host E2E と運用ドキュメントを更新すること | `Command alignment`, `Manual execution order`, `Checklist A-E`, `Failure log template` | automation と manual の handoff、比較順、記録方法を自己完結で再現できるようにする。 |
| known unstable を Paste / D&D と混線させないこと | `Checklist C`, `Known unstable`, `Fast triage table` | autocomplete は別トラックで記録し、Paste / D&D の成否へ混ぜない。 |

## Stream B completion summary
このStreamは 運用手順の明確化のみ を担当し、architectureやimplementationの再定義を行いません。そのため、他Streamの完了待ちをせず本書単体でクローズできます。

- host classを native provider対応 / 非対応 / capability未確定 の3分類で固定し、それぞれのfirst path / comparison path / separate triage / completion gateを明文化した。
- `xvfb-run` 未導入時はprovider triageに進まず、headless prerequisite未充足 としてautomation blockedを先に記録するrunbookを追加した。
- fallback policyを unsupported host向けcompatibility path として明示し、native Fail / fallback Passとnative Fail / fallback Failを別結論で読む表へ整理した。
- Known unstableとPaste / D&D regressionの関係を、autocomplete `#` only Failを独立させるseparate triageとして閉じる手順へ整理した。
- manual E2Eがまだ必要な理由は、Preview DOM / Problems UI / suggest widget / OS native paste/dropの最終挙動がautomation boundaryの外にあり、delegated manual scopeでしか確認できないためです。
- 以上により、issue-0010のmanual scopeは xvfb-run prerequisite → automation proof boundary → manual comparison path → keyword audit の導線を保ったまま、first path / comparison path / separate triage / fallback policy trace の4点を文書単体で再現可能です。