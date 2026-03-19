# AGENTS.md

**[Role]** MMI リードエージェント向けナビゲーション
**[Rule]** 作業開始時に必ず本書を読み、必要な文書へ自律的に辿ること。

## 0. ゴールデンルール
1. **ショートコマンドの解釈**: 人間から「現在のフェーズをクローズして」「次フェーズを計画して」等の短い指示を受けた場合、直ちに `00_Prompt/meta_prompt.md` を読み込み、指定された自律プロセスを展開せよ。
2. **仕様正本**: `00_Prompt/requirements.md`。
3. **決定と実行の分離**: 決定は `01_Plans/adr/`、実行計画は `01_Plans/issues/`。

## 1. Read Order（読む順序）
1) `AGENTS.md` (本書)
2) `00_Prompt/system_prompt.md` (憲法・絶対遵守ルール)
3) `00_Prompt/meta_prompt.md` (※人間からショートコマンドによる指示があった場合のみ)
4) `00_Prompt/agent_execution_protocol.md` & `virtual_stakeholder_consensus.md`
5) `00_Prompt/requirements.md`
6) `01_Plans/README.md`
7) `01_Plans/issues/issue-XXXX.md` (※着手中のActiveタスクのみ)

## 2. Project Map
- `00_Prompt/`: 憲法・要求仕様・AIプロトコル（system_prompt, requirements等）
- `01_Plans/`: 計画・タスク管理（meta_prompt, ADR, Issue Memo）
- `02_Architecture/`: 技術設計・I/F
- `03_Implement/`: 実装本体（`src/` 配下）
- `04_Documentation/`: 運用・ユーザーマニュアル
