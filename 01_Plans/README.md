# 01_Plans: Planning & Decision Hub

**MMI プロジェクトにおける「意思決定」と「タスク実行」の管理ディレクトリ。**

## Core Principle: 決定と実行の分離
1. **Decision (方針決定) -> `01_Plans/adr/`**
   - 不可逆な決定事項(ADR)。AIは曖昧さに直面時、仮想会議を実行しADRを起票。
2. **Action (タスク実行) -> `01_Plans/issues/`**
   - 短命な実行計画。AIはアトミックに実行し、CLI検証をパスすること。

## 開発の進め方 (AIエージェントの操作)
人間はAIに対して長大なプロンプトを入力する必要はありません。以下のショートコマンドをチャットに入力すると、AIが `00_Prompt/meta_prompt.md` を読み込み自律的にプロセスを展開します。

- **「現在のフェーズをクローズして」**: テスト結果等のエビデンスに基づく完了判定。
- **「次フェーズを計画して」**: 仮想ステークホルダー会議の実行、ADR・Issueの自動生成。
- **「並列実行用プロンプトを作成して」**: 競合しないファイル群ごとの実行エージェント用指示書生成。
- **「開発を進めて」**: クローズ判定〜プロンプト生成までを全自動実行。

**Performance note for AI agents:**
作業開始時、全ファイルを読まず、着手する `issue-XXXX.md` と関連 `ADR-XXXX.md` のみをコンテキストに含めること。

## Planning triage shortcut（運用入口）
未処理の ADR / issue を最小コンテキストで抽出したい場合は、まず `01_Plans/tools/planning_queue.py` を実行する。

```bash
python3 01_Plans/tools/planning_queue.py
```

### planning_queue.py を使うタイミング
- セッション開始直後（どの issue / ADR から読むか未確定の時）。
- docs audit で発見事項を上流へ還流した直後（pending / orphan が増減したか確認する時）。
- issue を `Done` に変更した直後（次の着手候補へ遷移する時）。

### planning_queue.py の期待出力
- `pending ADR`: `Draft` / `Proposed` の ADR 一覧。
- `pending issue`: `Draft` / `Open` / `In Progress` の issue 一覧。
- `orphan issue`: `Related ADR/Spec` に欠落参照がある issue 一覧。

この 3 点を確認し、次の 1 件だけを読む。
1. `In Progress` issue
2. `Open` issue
3. `Draft` issue
4. `pending ADR`

## docs audit -> 上流還流の参照順（feedback loop）
`docs audit` で見つかった改善点は、文書内で抱え込まず `feedback loop` として上流へ還流する。参照順は次で固定する。

1. `04_Documentation/` の監査結果を整理し、差分を項目化する（docs audit）。
2. `00_Prompt/requirements.md` を確認し、要件変更が必要な項目を切り出す。
3. `02_Architecture/` を確認し、設計変更が必要な項目を切り出す。
4. `03_Implement/test` 相当の検証観点不足を切り出す。
5. `01_Plans/adr/` に Decision が必要な項目を起票し、`01_Plans/issues/` に Action を起票する。
6. 最後に `planning_queue.py` を再実行し、pending / orphan の可視性を回復して triage に戻る。

## Planning Hub の標準導線（README 単体版）
1. この README を読む（運用原則の確認）。
2. `python3 01_Plans/tools/planning_queue.py` を実行（pending / orphan 可視化）。
3. 対象を 1 件に絞って issue 本文を読む。
4. 必要な ADR だけを読む（無関係 ADR は読まない）。
5. 実行または docs audit 還流を行う。
6. `planning_queue.py` を再実行し、次の issue / ADR へ進む。

- ツールは `01_Plans/adr/` と `01_Plans/issues/` の**先頭メタ情報だけ**を走査し、pending ADR / pending issue / orphan issue を一覧化する。
- 詳細運用は `01_Plans/planning-triage.md` を参照する。
