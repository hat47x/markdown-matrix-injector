# Phase 9 表パターンガイド (SIer 設計文書向け・ツール非依存)

> このガイドは Markdown Matrix Injector (MMI) や VS Code を一切インストールせずに読める、汎用的な SIer 設計文書向け表パターン集です。各パターンは Word / Excel / 任意の Markdown ビューアでもそのまま活用できます。MMI によるクエリ例は各表の末尾に **任意** の補足として示していますが、本ガイドの利用に MMI は必須ではありません。

生成元データ: `phase9-rule-table-benchmark-pack.csv`（本ガイドは `01_Plans/tools/generate_phase9_pattern_guide.py` により機械生成されます。直接編集しないでください）。

## RequirementsTraceability

要件と検証（テスト/レビュー）の対応関係を追跡する表です。各行が1つの要件対応ルールを表し、「どの要件が」「どの条件で」「どう検証済みとみなすか」を宣言的に記録します。監査時に要件カバレッジを説明する根拠として使えます。

| RuleId | RuleSet | ConditionExpr | ActionExpr | Priority | EffectiveFrom | ExpiresAt | RelatedRequirement | Owner | Notes |
|---|---|---|---|---|---|---|---|---|---|
| REQ_TRACE_AUTH | ReqTrace | module=AUTH AND doc=required | link requirement to verification row | 90 | 2026-04-03 | 2026-12-31 | Phase9-Template | author | 要件トレースの基準行 |
| REQ_TRACE_PRINT | ReqTrace | module=PRINT AND control=pageBreak | attach print evidence reference | 85 | 2026-04-03 | 2026-12-31 | Phase9-Template | reviewer | 印刷制御の追跡行 |

> **Optional: query this table with Markdown Matrix Injector**
>
> MMI をお使いの場合、以下のクエリパラメータ例を `![[phase9-rule-table-benchmark-pack.csv#Sheet1|<range>?mode=table&...]]` へ追加することで、本テーブルの断面を Markdown へインライン表示できます（本ガイドの理解に MMI は不要です）。
>
> - `REQ_TRACE_AUTH`: `header=first&columns=A,B,C,J,K`
> - `REQ_TRACE_PRINT`: `header=first&grep=PRINT`

## StateTransition

文書やチケットなどのライフサイクル状態遷移を定義する表です。各行が1つの遷移ルールを表し、「どの状態から」「どの条件で」「どの状態へ」「何をトリガーに」遷移するかを記録します。承認フローやワークフロー設計のレビュー資料として使えます。

| RuleId | RuleSet | ConditionExpr | ActionExpr | Priority | EffectiveFrom | ExpiresAt | RelatedRequirement | Owner | Notes |
|---|---|---|---|---|---|---|---|---|---|
| STATE_REVIEW_TO_APPROVED | StateFlow | state=REVIEW AND decision=APPROVE | move state to APPROVED | 80 | 2026-04-03 | 2026-12-31 | Phase9-Template | author | 状態遷移の正常系 |

> **Optional: query this table with Markdown Matrix Injector**
>
> MMI をお使いの場合、以下のクエリパラメータ例を `![[phase9-rule-table-benchmark-pack.csv#Sheet1|<range>?mode=table&...]]` へ追加することで、本テーブルの断面を Markdown へインライン表示できます（本ガイドの理解に MMI は不要です）。
>
> - `STATE_REVIEW_TO_APPROVED`: `header=first&columns=A,B,D,E`

## FailureTriage

障害・問い合わせの一次切り分けルールを定義する表です。各行が1つの切り分けルールを表し、「どんな症状が」「どんな条件のとき」「どう分類・対応するか」を記録します。サポート担当者の初動対応マニュアルとして使えます。

| RuleId | RuleSet | ConditionExpr | ActionExpr | Priority | EffectiveFrom | ExpiresAt | RelatedRequirement | Owner | Notes |
|---|---|---|---|---|---|---|---|---|---|
| TRIAGE_PATH_UNRESOLVED | Triage | path unresolved | classify incident as path failure | 88 | 2026-04-03 | 2026-12-31 | Phase9-Template | delivery | 一次切り分けのパス失敗 |

> **Optional: query this table with Markdown Matrix Injector**
>
> MMI をお使いの場合、以下のクエリパラメータ例を `![[phase9-rule-table-benchmark-pack.csv#Sheet1|<range>?mode=table&...]]` へ追加することで、本テーブルの断面を Markdown へインライン表示できます（本ガイドの理解に MMI は不要です）。
>
> - `TRIAGE_PATH_UNRESOLVED`: `header=first&grep=path`

## ReleaseGateDecision

リリース可否判定のルールを定義する表です。各行が1つの判定ルールを表し、「どの検証結果が」「どんな条件のとき」「リリースを許可/ブロックするか」を記録します。リリース判定会議の判断根拠として使えます。

| RuleId | RuleSet | ConditionExpr | ActionExpr | Priority | EffectiveFrom | ExpiresAt | RelatedRequirement | Owner | Notes |
|---|---|---|---|---|---|---|---|---|---|
| GATE_BLOCK_UNIT_FAIL | ReleaseGate | unit test failed | block release and create action issue | 95 | 2026-04-03 | 2026-12-31 | Phase9-Template | delivery | ゲート停止の標準ルール |

> **Optional: query this table with Markdown Matrix Injector**
>
> MMI をお使いの場合、以下のクエリパラメータ例を `![[phase9-rule-table-benchmark-pack.csv#Sheet1|<range>?mode=table&...]]` へ追加することで、本テーブルの断面を Markdown へインライン表示できます（本ガイドの理解に MMI は不要です）。
>
> - `GATE_BLOCK_UNIT_FAIL`: `header=first&columns=A,B,F&grep=block`

---

生データ（CSV）: [`phase9-rule-table-benchmark-pack.csv`](./phase9-rule-table-benchmark-pack.csv)  
運用手順（MMI 利用者向け）: [`phase9-rule-table-template-operations.md`](../process/phase9-rule-table-template-operations.md)
