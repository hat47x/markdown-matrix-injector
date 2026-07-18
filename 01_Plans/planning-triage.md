# Planning Triage Guide

## Purpose
この文書は、**計画実行のたびに ADR と issue を全部読み直さず**、未処理項目だけを最小コンテキストで抽出して着手対象を決めるための運用手順を定義します。

狙いは次の 3 点です。

1. **コンテキストウィンドウ節約**: 全文ではなく、まずメタ情報だけを見る。
2. **正本の分離維持**: Decision は ADR、Action は issue として別々に判断する。
3. **自律実行の再開性向上**: 次エージェントが「何を先に読むべきか」を即決できるようにする。

## Why a small Python tool is the best fit
この用途では Python ツールが最適です。

- リポジトリ内で完結し、追加依存が不要。
- Markdown 全文ではなく、**先頭数十行の Meta 領域だけ**を走査できる。
- CI でもローカルでも同じコマンドで使える。
- 将来 ADR / issue の件数が増えても、全文ロードより安定して軽い。

そのため、運用の正規入口として `01_Plans/tools/planning_queue.py` を追加しています。

## Definition of "unprocessed"
### ADR
次のステータスを **未処理** とみなします。

- `Draft`
- `Proposed`

`Accepted` / `Rejected` / `Superseded` は、通常の実行対象から外します。

### Issue
次のステータスを **未処理** とみなします。

- `Draft`
- `Open`
- `In Progress`

`Done` は履歴扱いとし、日常の着手候補から外します。

## Standard operating procedure
### Step 1: まず索引と差分だけを見る
最初に次の 2 つだけを確認します。

- `01_Plans/README.md`
- `01_Plans/issues/README.md`

この段階では、個別 issue や ADR の本文は読まないでください。ここでは lifecycle と着手原則だけを確認します。

### Step 2: Python ツールで pending 一覧を抽出する
リポジトリルートで次を実行します。

```bash
python3 01_Plans/tools/planning_queue.py
```

JSON が必要なら次を使います。

```bash
python3 01_Plans/tools/planning_queue.py --format json
```

このツールは以下だけを行います。

- `01_Plans/adr/ADR-*.md` の先頭メタ行を走査する。
- `01_Plans/issues/issue-*.md` の先頭メタ行を走査する。
- pending ADR / pending issue / ADR 参照不整合を一覧化する。

**重要**: 本文全体は読まず、先頭の Meta / Traceability 範囲だけを対象にします。これがコンテキスト削減の主手段です。

### Step 3: 読み込む対象を 1 件に絞る
出力を見たら、次の優先順で **1 件だけ** 選びます。

1. `In Progress` の issue
2. `Open` の issue
3. `Draft` の issue
4. `Draft` / `Proposed` の ADR

理由:

- `In Progress` は再開コストが最小。
- `Open` は acceptance / validation が揃っている可能性が高い。
- `Draft` issue や未確定 ADR は、実装前の整理対象として後順位にする。

### Step 4: 選んだ issue 本文だけ読む
選定後に初めて、対象 issue の本文を読みます。

この時点でも、読むのは次の順に限定します。

1. `Acceptance criteria`
2. `Validation plan`
3. `Task breakdown`
4. 必要時のみ `Proposed solution`

これにより「まず全部読む」を避けられます。

### Step 5: 関連 ADR は referenced items だけ読む
issue の `Related ADR/Spec` に ADR が書かれている場合だけ、その ADR を読むようにします。

- 参照されていない ADR は読まない。
- `requirements.md` は仕様確認が必要なときだけ読む。
- 議事録セクション (`## 議事録 (AI読込不要)`) は通常読まない。

### Step 6: 実装または計画更新へ進む
- 実装タスクなら issue を更新する。
- 意思決定が必要なら新規 ADR を起票する。
- 実装を伴わない運用整理ならドキュメント更新だけで閉じる。

## Decision table: what to read next
| Queue result | Next document to open | Avoid reading yet |
|---|---|---|
| `In Progress` issue exists | その issue 本文 | 他の issue 全文、無関係な ADR |
| `Open` issue only | 優先度最高の issue 本文 | Done issue |
| pending ADR only | 該当 ADR 本文 | Done issue 全文 |
| orphan issue found | issue 本文 → 欠落 ADR の有無確認 | 実装コード全文 |
| no pending items | requirements / backlog 見直し | 履歴の全文読込 |

## Recommended commands
### Human-readable triage
```bash
python3 01_Plans/tools/planning_queue.py
```

### Machine-readable triage for future automation
```bash
python3 01_Plans/tools/planning_queue.py --format json
```

### Quick follow-up: open only one selected issue
```bash
sed -n '1,220p' 01_Plans/issues/issue-0010-phase5-native-paste-drop-provider.md
```

## Integration with autonomous execution rules
この手順は、既存の実行プロトコルと矛盾しません。

- `01_Plans/issues/README.md` の lifecycle をそのまま使用する。
- `00_Prompt/agent_execution_protocol.md` の **Atomic Execution** に従い、対象 issue を 1 件へ絞る。
- `01_Plans/README.md` の **Performance note** に従い、最初から全件読込をしない。

## Current expected behavior in this repository
現時点では、ツール実行結果から次を高速に判別できる想定です。

- 未処理 issue が 1 件以上あるか。
- 未確定 ADR があるか。
- `Related ADR/Spec` に欠落参照がある issue があるか。

これにより、次エージェントは「まず pending 一覧 → 対象 1 件 → 関連 ADR だけ」の順で着手できます。
