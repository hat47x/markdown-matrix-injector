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

## Planning triage shortcut
未処理の ADR / issue を最小コンテキストで抽出したい場合は、まず `01_Plans/tools/planning_queue.py` を実行する。

```bash
python3 01_Plans/tools/planning_queue.py
```

- このツールは `01_Plans/adr/` と `01_Plans/issues/` の**先頭メタ情報だけ**を走査し、pending ADR / pending issue / 欠落 ADR 参照を一覧化する。
- 運用手順の詳細は `01_Plans/planning-triage.md` を参照する。
- ツール出力で対象を 1 件に絞ってから、その issue 本文と関連 ADR だけを読むこと。
