# Developer Setup

## 実装コードの場所
- 実装本体: `03_Implement/src/`
- テスト: `03_Implement/test/`
- Node / TypeScript 設定: `03_Implement/package.json`, `03_Implement/tsconfig.json`, `03_Implement/.gitignore`

## まず入れておく依存関係
Phase 5 の VSCode 連携確認では、単なる `npm install` だけでなく、**host 側で Extension Host を起動できること** と **headless 実行に必要な表示系依存がそろっていること** が前提になります。

### 必須
- Node.js / npm
- VSCode 本体（manual 確認で Extension Development Host を起動できる host）
- `03_Implement` 配下の npm 依存 (`npm install`)

### headless E2E 用
- `xvfb-run`
- Electron / VSCode が headless 起動時に必要とする基本ライブラリ群

Debian / Ubuntu 系の例:
```bash
sudo apt-get update
sudo apt-get install -y xvfb libgtk-3-0 libnss3 libxss1 libasound2
```

> `npm run test:e2e` は内部で VSCode Extension Host を起動します。GUI を持たない Linux / container 環境では、通常 `xvfb-run` が無いと開始地点に立てません。

## 開発コマンド
```bash
cd 03_Implement
npm install
npm test
npm run build
npm run test:e2e
```

## Phase 5 に入る前の理解ポイント
Phase 5 の native provider / fallback 確認は、次の 4 つを分けて考えると迷いません。

1. **ビルド前提**: `npm run build` で拡張を最新状態にする。
2. **headless prerequisite**: `npm run test:e2e` の前に `xvfb-run --help` が通ることを確認し、通らない場合は automation blocked と判断する。
3. **自動 E2E 範囲**: Extension Host 上で native provider registration / fallback command / shared DataTransfer logic / diagnostics / completion API の境界を確認する。
4. **手動 E2E 範囲**: ホスト OS 上の VSCode で Extension Development Host を起動し、native paste / drop の最終 UX、Preview / Problems、manual comparison 順を確認する。

## Automation と manual の責務早見表
| Concern | Automation (`npm run test:e2e`) | Manual E2E (Development Host) | 判定メモ |
|---|---|---|---|
| native provider が canonical path であること | provider registration / adapter / shared logic を確認 | 通常 paste / 通常 drop の最終 UX を確認 | 実 OS event の最終反映は manual 側 |
| fallback command が unsupported host 向け compatibility path であること | fallback command が成立することを確認 | fallback only host で比較順どおりに再現する | fallback は native 代替ではなく互換経路 |
| shared logic 再利用方針 | DataTransfer 解析の再利用を自動確認する | native と fallback の挿入結果差を観測する | 差分が両方失敗なら parser / payload を疑う |
| `xvfb-run` 前提 | `xvfb-run` が無ければ開始しない | manual は継続可能だが automation blocked を記録する | manual 成功で automation failure を上書きしない |
| autocomplete Known unstable | `#` 補完の非決定性を別トラックで扱う | Paste / D&D と別欄に記録する | Known unstable を provider failure に混ぜない |

## 自動確認の入口
Extension Host ベースの自動確認を行うときは、**必ず headless prerequisite を確認してから** 次を実行します。

```bash
xvfb-run --help
cd 03_Implement
npm run build
npm run test:e2e
```

この入口で確認する対象:
- VSCode Extension Host が起動できること
- `xvfb-run` を前提とした headless 実行条件が満たされていること
- 補完 / Diagnostics / command fallback / native provider adapter の自動確認が走ること
- native provider と fallback command が同一 DataTransfer 解析ロジックを再利用していること

### automation blocked と判断する条件
- `xvfb-run --help` が失敗する。
- Electron / VSCode の起動に必要な GUI 依存が欠け、Extension Host が立ち上がらない。
- この場合は **provider/fallback の仕様失敗ではなく headless prerequisite 未充足** として扱い、manual E2E の記録とは別に残してください。

## 手動確認の入口
次のような項目は、自動 E2E だけでは完結しません。

- Markdown Preview 上の見た目
- Problems パネルの見え方
- VSCode Suggest UI の操作感
- OS ネイティブの paste / drag-and-drop が実際にどう振る舞うか
- native path と fallback path の比較順どおりに観測できるか

そのため、manual 確認に入る前提として以下を満たしてください。

1. ホスト OS の VSCode でリポジトリを開けること。
2. `cd 03_Implement && npm install && npm run build` が完了していること。
3. VSCode の `Run Extension` などを使って **Extension Development Host** を起動できること。
4. native paste / drop を試す場合、clipboard / file drag-and-drop を実際に発火できるローカル host であること。
5. host class を **native provider 対応 / fallback only / capability 未確定** のどれかで先にメモすること。
6. autocomplete の `#` 補完 failure が出ても、Paste / D&D の結論欄と混ぜないことを理解していること。

> manual E2E の詳細手順やチェックリストは `04_Documentation/vscode-e2e-testing.md` に分離しています。本書では環境準備と実行入口だけを扱い、Preview / Problems / native event の詳細手順、comparison 順、failure triage はそちらへ委譲します。

## Phase 5 issue-0010 alignment snapshot
architecture / runbook / setup の責務境界を迷わず辿るため、issue-0010 に関わる文書正本をここで最短参照にまとめます。

| Concern bucket | Primary source of truth | Why this file only links, not redefines |
|---|---|---|
| native canonical path | `02_Architecture/vscode-extension-host-e2e.md` | canonical path の定義は architecture の責務であり、setup は参照入口だけを持つ |
| fallback compatibility path | `04_Documentation/vscode-e2e-testing.md` | unsupported host の first path / comparison path は runbook の責務であり、setup は起動前提だけを示す |
| xvfb-run prerequisite | `04_Documentation/developer-setup.md` と `04_Documentation/vscode-e2e-testing.md` | setup は prerequisite と実行入口を正本として持ち、詳細 triage は runbook へ委譲する |
| known unstable separation | `04_Documentation/vscode-e2e-testing.md` | autocomplete と Paste / D&D の切り分けは runbook の責務であり、setup は注意喚起に留める |

## Phase 5 command gate (before runbook)
manual / automation のどちらに進む場合も、次の gate を先に通してください。**ここで止まった場合は runbook 上の native/fallback triage に進まない** のが issue-0010 の運用ルールです。

| Order | Gate | Command / action | Exit condition |
|---|---|---|---|
| 1 | dependency gate | `cd 03_Implement && npm install` | package install 完了 |
| 2 | build gate | `cd 03_Implement && npm run build` | 最新バンドル生成完了 |
| 3 | xvfb-run prerequisite gate | `xvfb-run --help` | headless automation へ進んでよい / 失敗なら automation blocked |
| 4 | automation gate | `cd 03_Implement && npm run test:e2e` | automated proof boundary を確認 |
| 5 | manual gate | `F5` で `Run Extension` → `04_Documentation/vscode-e2e-testing.md` の host-class 手順へ進む | first path / comparison path / separate triage を runbook で追跡 |

## Phase 5 / VSCode integration の進め方
1. `cd 03_Implement && npm install`
2. `cd 03_Implement && npm run build`
3. `xvfb-run --help` を実行し、headless prerequisite を確認する。
4. automation scope を回すなら `cd 03_Implement && npm run test:e2e` を実行する。
5. Preview / Problems / native paste / native drop の最終確認が必要なら、ホスト VSCode で Extension Development Host を起動する。
6. manual では host class を記録し、native path / fallback path の比較順を `04_Documentation/vscode-e2e-testing.md` の checklist に従って実施する。
7. `#` 補完 failure は Known unstable として別欄へ記録し、Paste / D&D の成否欄へ混ぜない。

## テストデータ方針
- Excel / Spreadsheet 系のテストデータはリポジトリへ固定ファイルとして追加せず、ユニットテスト内で都度生成する。
- VSCode E2E は既存 fixture workspace を一時コピーし、必要な追加ファイル（例: invalid XML）だけを実行時に生成する。
