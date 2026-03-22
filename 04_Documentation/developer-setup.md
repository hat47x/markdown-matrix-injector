# Developer Setup

## 実装コードの場所
- 実装本体: `03_Implement/src/`
- テスト: `03_Implement/test/`
- Node / TypeScript 設定: `03_Implement/package.json`, `03_Implement/tsconfig.json`, `03_Implement/.gitignore`

## この文書の責務
この文書は **前提条件** と **実行入口** だけを扱います。`02_Architecture/vscode-extension-host-e2e.md` の「Headless execution boundary」で定義されたとおり、ここで扱うのは **verification entry condition を成立させるための環境前提** までです。issue-0010 の validation plan に合わせ、ここで固定するのは次の 4 点だけです。

1. 対象読者は、ローカル開発者・CI maintainer・container 利用者のうち、**これから Extension Host E2E の開始条件を整える人** であること。
2. `npm install` / `npm run build` / `xvfb-run --help` / `npm run test:e2e` / manual gate (`F5`) の順で迷わず進めること。
3. `xvfb-run` や GUI 依存不足による **automation blocked** を、native provider / fallback の仕様失敗と混同しないこと。
4. 詳細な manual runbook や architecture 境界の説明は、それぞれ専用文書へ委譲すること。

- architecture の正本: `02_Architecture/vscode-extension-host-e2e.md`
- manual runbook の正本: `04_Documentation/vscode-e2e-testing.md`

## まず入れておく依存関係
Phase 5 の VSCode 連携確認では、単なる `npm install` だけでなく、**host 側で Extension Host を起動できること** と **headless / CI / container 実行に必要な表示系依存がそろっていること** が前提です。ここでの目的は E2E ケース内容の説明ではなく、**VSCode Engine を起動する前提条件を setup 文書だけで理解できる状態にすること** です。

### 必須
- Node.js / npm
- VSCode 本体（manual 確認で Extension Development Host を起動できる host）
- `03_Implement` 配下の npm 依存 (`npm install`)

### headless / CI / container 用
- `xvfb-run` または同等の仮想ディスプレイ起動手段
- Electron / VSCode が headless 起動時に必要とする基本ライブラリ群
- Linux container / CI 上で `DISPLAY` を持たない状態でも Extension Host を起動できること

Debian / Ubuntu 系の例:
```bash
sudo apt-get update
sudo apt-get install -y xvfb libgtk-3-0 libnss3 libxss1 libasound2
```

> `npm run test:e2e` は内部で VSCode Extension Host を起動します。GUI を持たない Linux / container 環境では、通常 `xvfb-run` が無いと開始地点に立てません。
>
> CI で別の仮想ディスプレイ手段を使う場合でも、ここで確認したい意味は同じです。**「Extension Host を headless で起動できるか」** が entry condition であり、provider / fallback の仕様判定とは別です。

## headless prerequisite の読み方
`02_Architecture/vscode-extension-host-e2e.md` の headless execution boundary を setup に落とすと、読むべきポイントは次の 3 つです。

1. `xvfb-run` 相当が無い状態では、provider / fallback の比較以前に **VSCode Extension Host 自体が起動できない** 可能性がある。
2. したがって `xvfb-run --help` や GUI 依存確認は、E2E assertion ではなく **verification entry condition の確認** である。
3. entry condition を満たした後ではじめて、`npm run test:e2e` の失敗を provider registration / fallback command / shared DataTransfer logic の論点として読める。

この文書は 1〜2 の説明だけを受け持ちます。3 以降の run 結果の読み分けは `04_Documentation/vscode-e2e-testing.md` に委譲します。

## 実行入口: まずこの順で進める
manual / automation のどちらへ進む場合でも、まず次の gate を上から順に通してください。setup の責務は **入口の整列** までであり、途中で失敗した場合の詳細 triage は runbook へ委譲します。

| Order | Gate | Command / action | この文書での判定 |
|---|---|---|---|
| 1 | dependency gate | `cd 03_Implement && npm install` | npm 依存がそろったら次へ進む |
| 2 | build gate | `cd 03_Implement && npm run build` | 最新バンドルができたら次へ進む |
| 3 | headless prerequisite gate | `xvfb-run --help` | 成功なら automation へ進める。失敗なら automation blocked |
| 4 | automation gate | `cd 03_Implement && npm run test:e2e` | Extension Host 自動確認の入口 |
| 5 | manual gate | `F5` で `Run Extension` | manual runbook の host-class 手順へ進む |

## 入口ごとの最短解釈
### 1. dependency gate
```bash
cd 03_Implement
npm install
```
- 以後の build / test:e2e / manual gate の共通前提です。
- setup 文書では依存導入完了だけを確認し、依存不整合の詳細分析は扱いません。

### 2. build gate
```bash
cd 03_Implement
npm run build
```
- issue-0010 の validation plan にある build 確認入口です。
- automation / manual の両方で、まず最新ビルドを作ってから先へ進みます。

### 3. headless prerequisite gate
```bash
xvfb-run --help
```
- `npm run test:e2e` の前に必ず確認する入口です。
- ここで失敗した場合の結論は **automation blocked** です。
- この時点では **native provider / fallback / DataTransfer 仕様の失敗はまだ未観測** です。

### 4. automation gate
```bash
cd 03_Implement
npm run test:e2e
```
- Extension Host ベースの自動確認入口です。
- provider registration / fallback command / shared DataTransfer logic / diagnostics / completion API など、automation scope の事実確認に進みます。
- 何をどう切り分けるかの詳細は `04_Documentation/vscode-e2e-testing.md` を参照してください。

### 5. manual gate
- `F5` で `Run Extension` を起動し、Extension Development Host を開きます。
- ここで確定するのは **manual 観測に入れること** までです。
- Preview / Problems / native Paste / D&D / host class / comparison 順の詳細は `04_Documentation/vscode-e2e-testing.md` を参照してください。

## provider / fallback 仕様失敗との切り分けメモ
headless prerequisite 不足と provider / fallback 仕様失敗は、記録上も明確に分けて扱ってください。

- `xvfb-run --help` が失敗した、または GUI 依存不足で VSCode が起動しない
  - 分類: **verification entry condition 未充足**
  - 意味: Extension Host E2E をまだ開始できていない
- `npm run test:e2e` までは到達したが native provider registration / fallback command / shared parsing assertion が落ちた
  - 分類: **provider/fallback 仕様または実装の失敗**
  - 意味: headless prerequisite は満たしており、E2E の観測結果として扱える
- autocomplete の known unstable が同じ run で見えた
  - 分類: **別トラックの既知リスク**
  - 意味: Paste / D&D の acceptance boundary と混同しない

## automation blocked の定義
次の状態は **automation blocked** として扱います。

- `xvfb-run --help` が失敗する。
- Electron / VSCode の起動に必要な GUI 依存が欠け、Extension Host が立ち上がらない。
- headless 前提不足のため、`npm run test:e2e` の入口に到達できない。

一方で、次は **automation blocked ではありません**。

- native provider registration の失敗
- fallback command の assertion failure
- shared DataTransfer parsing の失敗
- autocomplete の Known unstable

これらは **headless prerequisite を満たした後に観測される automation scope の結果** であり、provider/fallback の仕様失敗または別トラックの不安定要因として runbook / architecture 側で扱います。

## setup / runbook / architecture の責務差分
| 文書 | 役割 | ここに書かないこと |
|---|---|---|
| `04_Documentation/developer-setup.md` | 前提条件と実行入口を最短で示す | manual 詳細手順、failure triage 詳細、architecture 境界の再定義 |
| `04_Documentation/vscode-e2e-testing.md` | manual E2E の再現手順、観測順、failure triage を持つ | setup の前提条件を再定義すること |
| `02_Architecture/vscode-extension-host-e2e.md` | native canonical path / fallback compatibility path / shared logic / known risk isolation の境界を固定する | 実行手順や運用チェックリストの詳細 |

## 最短参照導線
- **前提条件と入口を確認したい** → この文書
- **manual E2E の観測順や failure triage を確認したい** → `04_Documentation/vscode-e2e-testing.md`
- **native provider / fallback / known unstable の責務境界を確認したい** → `02_Architecture/vscode-extension-host-e2e.md`

## テストデータ方針
- Excel / Spreadsheet 系のテストデータはリポジトリへ固定ファイルとして追加せず、ユニットテスト内で都度生成する。
- VSCode E2E は既存 fixture workspace を一時コピーし、必要な追加ファイル（例: invalid XML）だけを実行時に生成する。

## この追記で確認できる位置
- **対象読者**: 「この文書の責務」で、ローカル開発者 / CI maintainer / container 利用者向けの setup 文書であることを明記しました。
- **前提条件**: 「まず入れておく依存関係」と「headless prerequisite の読み方」に、`xvfb-run` 相当と GUI 依存が Extension Host 起動条件であることを集約しました。
- **手順の位置**: 実行順は「実行入口: まずこの順で進める」に限定し、manual E2E の詳細手順は `04_Documentation/vscode-e2e-testing.md` へ委譲する形を維持しました。
