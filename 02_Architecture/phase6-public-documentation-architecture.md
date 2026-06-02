# Phase 6 Public Documentation Architecture

## Purpose
この文書は、Phase 6 で整備する公開文書の情報アーキテクチャと、文書化から requirements / architecture / test へ知見を戻す feedback loop を固定するための設計文書です。
本書は `issue-0018` / `issue-0019` / `issue-0020` の quality gate 要件を統合した、Phase 6 quality gate の正本として扱います。

## Architecture scope and operating boundary (issue-0019準拠)
- 本書は「公開文書の運用定義そのもの」を扱うのではなく、Gate A〜E の**入力・責務・出力・還流先**を設計要素として規定する。
- Gate運用のテンプレート実体（監査票・分類票・scorecard）は `01_Plans/templates/` を参照するが、運用判断の起点は常に本書の Gate 定義に置く。
- docs audit / feedback loop / scorecard / planning_queue は、個別作業ではなく 1 本の追跡可能なパイプラインとして扱う。
- 追跡単位は「1 docs iteration（1回の文書更新サイクル）」とし、各 iteration で Gate A→B→C→D→E を必ず完走させる。

## Documentation layers
Phase 6 の公開文書は、次の 4 層を正本とします。

1. **Overview**
   - 目的: 何のツールか、誰に効くか、どの課題を解くかを短時間で理解させる。
   - 主な読者: 初見の評価者、導入判断者、チームリーダー。
2. **Tutorial**
   - 目的: 最小成功体験までを再現させる。
   - 主な読者: 初回利用者、PoC 担当者。
3. **Scenario Guides**
   - 目的: 業務文脈ごとの使いどころを説明する。
   - 主な読者: SIer 設計者、レビュー担当者、納品準備担当者。
4. **Reference**
   - 目的: 記法と各機能の仕様を正確に引けるようにする。
   - 主な読者: 継続利用者、開発者、サポート担当者。

## Public doc set for the first Phase 6 iteration
| Layer | Canonical file | Why it exists |
|---|---|---|
| Overview | `04_Documentation/overview.md` | 価値、対象読者、主要機能、導入判断ポイントを短く伝える |
| Tutorial | `04_Documentation/tutorial.md` | 最初の埋め込み成功までを手順化する |
| Scenario Guides | `04_Documentation/scenario-sier-design-docs.md` | SIer の設計書移行・別紙参照・レビュー準備に寄せた使い方を示す |
| Reference | `04_Documentation/reference.md` | 記法、パラメータ、Smart Fallback、印刷制御、Diagnostics、Paste / D&D を一覧で引けるようにする |

## Documentation feedback loop
文書化から得た知見は、次の順で上流へ戻します。

1. **Observation capture**
   - 例: 用語が分かりにくい、前提条件が抜けている、期待結果が曖昧、説明しにくい UI/仕様がある。
2. **Classification**
   - requirements 問題: 誰向けに何を保証するかが曖昧。
   - architecture 問題: 正本の所在、責務、文書構成、サンプル戦略が曖昧。
   - test 問題: 文書で主張した内容に対応する検証経路がない。
   - product gap: 実装不足や UX 不足が文書化の障害になっている。
3. **Upstream reflection**
   - requirements 問題 → `00_Prompt/requirements.md`
   - architecture 問題 → `02_Architecture/*.md` または ADR
   - test 問題 → `01_Plans/issues/` へ test/docs-audit issue を起票し、必要なら `03_Implement/test` の拡張を計画する
   - product gap → feature / bugfix issue を起票する
4. **Trace note**
   - 公開文書の更新時に「どの知見をどこへ反映したか」を issue / ADR / commit で追跡できる状態にする。

## Quality gate (authoritative)
以下は `issue-0018` / `issue-0019` / `issue-0020` から統合した、公開文書全体に適用される gate です。

### Gate A: Baseline structure and consistency
- **Architecture objective**: 公開文書の情報導線を標準化し、読者の到達経路を固定する。
- **Architecture input**: 4層文書（Overview / Tutorial / Scenario / Reference）の現行差分。
- **Architecture output**: 導線監査結果（Pass/Fail）、欠落セクション一覧、修正要求。
- 各公開文書は最低限、以下の節を持つ。
  - `## Target reader`
  - `## Prerequisites`
  - `## Expected result`
  - `## Related docs`
  - `## Known limitations`
- 手順書 / シナリオ文書は「入力例」「実行手順」「期待される観測結果」を含める。
- Reference は「シンタックス」「主なパラメータ」「挙動」「制約」「関連正本リンク」を機能単位で保持する。
- 公開文書間の導線は Overview → Tutorial → Scenario → Reference の順で到達可能とする。
- `04_Documentation/` 配下の公開文書本文は、英語交じりの文体を避け、標準的な日本の技術書に準じた文章構成を維持する。

### Gate B: Reference trustworthiness
- **Architecture objective**: Reference を一次情報として再利用できる信頼粒度に固定する。
- **Architecture input**: Gate A の導線監査結果、Reference Card 差分、既知制約一覧。
- **Architecture output**: Card単位の判定（Pass/Conditional Pass/Fail）と是正要求。
- 判定単位は「1 機能（または 1 パラメータ群）= 1 Reference Card」とし、各 Card は次の必須項目を欠落なく持つ。
  - 正常系挙動（入力、期待結果、観測ポイント）
  - 代表的な失敗ケース（再現条件、ユーザー影響）
  - 制約（適用範囲、非対応条件、性能/表示上の注意）
  - 失敗時の一次対応（回避策、切り分け手順、上流正本への導線）
  - 関連正本リンク（requirements / architecture / issue / test）
- Smart Fallback / 印刷制御 / Diagnostics / Paste & D&D は、最低 2 件以上の失敗シナリオ（入力起因・環境起因）を持つ。
- 制約は「仕様制約（must）」「運用制約（should）」「既知制約（known limitation）」に分類して記載する。
- repo 内リンク切れを許容しない（docs audit で検出し修正する）。外部リンクは「到達不可時の代替導線」を併記する。
- Gate B 判定は Pass / Conditional Pass / Fail の 3 値で記録し、Conditional Pass は期限付き是正タスクを必須化する。
- 目標状態は「サポート一次回答を Reference リンクのみで返せる粒度」とする。

### Gate C: Docs audit operations
- **Architecture objective**: docs audit を定常化し、feedback loop の分類漏れを防止する。
- **Architecture input**: Gate A/B 判定結果、対象文書差分、上流正本（requirements / architecture / issue / ADR）、未解決項目。
- **Architecture output**: 分類済みフィードバック一覧（未分類 0 件）、反映先リンク台帳。
- docs audit は単発でなく定常運用とし、docs 更新イテレーションごとに実施する。
- Gate C は Gate A/B の導線・品質監査を前提入力として受け取る。
- 監査時は次を入力とする。
  - 対象文書差分
  - 上流正本（requirements / architecture / issue / ADR）
  - 直近の未解決フィードバック項目
- 監査結果は次の分類を必須とし、未分類 0 件を完了条件とする。
  - requirements
  - architecture
  - test
  - product gap
- 監査結果は issue / ADR / commit のいずれかへ反映し、反映先リンクを記録する。

### Gate D: KPI scorecard measurement
- **Architecture objective**: Gate C の結果を定量評価へ接続し、次 iteration の優先順位を決める材料を作る。
- **Architecture input**: Gate C 分類結果、前回 scorecard、未完了是正タスク。
- **Architecture output**: KPI scorecard 更新結果、次アクション候補、未完了事項。
- Phase 6 KPI は以下の 4 指標を毎イテレーションで計測可能であること。
  - **TFS**
  - **Decision Readiness**
  - **Support Deflection**
  - **Feedback Closure**
- Gate D は Gate C の分類結果を入力として scorecard に記録する。
- scorecard には最低限、以下を保持する。
  - 測定日
  - 対象文書
  - 判定
  - 次アクション
  - 反映先リンク（requirements / architecture / tests / issue）
- issue-0016〜0019 成果を最低 1 回は scorecard で評価可能であること。

### Gate E: Traceability and planning integrity
- **Architecture objective**: Gate A〜D で得た知見を計画系へ還流し、次サイクルの実行可能性を保つ。
- **Architecture input**: Gate D scorecard、未反映フィードバック、issue/ADR 状態。
- **Architecture output**: planning_queue 観測結果、orphan/pending 対応方針、Validation evidence。
- docs 変更コミットごとに「発見事項 → 分類 → 反映先」を追跡可能にする。
- `01_Plans/tools/planning_queue.py` 実行時に orphan / pending 状態が観測できる運用を維持する。
- quality gate の判定ログは、後続イテレーションが再利用できる粒度で残す。

## Gate connection architecture (docs audit / feedback loop / scorecard / planning_queue)
以下の接続を Phase 6 の固定アーキテクチャとする。

1. **docs audit (Gate C)**
   - Gate A/B の結果と文書差分を入力し、指摘事項を抽出する。
2. **feedback loop 分類 (Gate C)**
   - 指摘事項を `requirements / architecture / test / product gap` へ分類し、未分類を 0 件化する。
3. **scorecard 記録 (Gate D)**
   - 分類結果を KPI 指標（TFS / Decision Readiness / Support Deflection / Feedback Closure）へ写像する。
4. **planning_queue 連携 (Gate E)**
   - `python3 01_Plans/tools/planning_queue.py` で orphan / pending を可視化し、次の issue/ADR 起票要否を判断する。
5. **上流還流**
   - requirements: `00_Prompt/requirements.md`
   - architecture: `02_Architecture/*.md` または ADR
   - test: `01_Plans/issues/`（必要に応じ `03_Implement/test` 計画へ接続）
   - product gap: feature / bugfix issue

## Writing policy as architecture constraint
- 公開文書は、**日本の技術書**で一般的な構成（目的→前提→手順→期待結果→制約→関連資料）を基準とする。
- 文章構成は読者行動に従い、用語定義を先に置いてから操作手順へ進む。
- architecture で定義した節順序（Target reader / Prerequisites / Expected result / Related docs / Known limitations）を文体規約の最小制約として扱う。
- 「英語交じりの見出し乱立」「結論前の冗長な背景説明」「観測不能な期待結果」を禁止し、監査で検出対象とする。

## Docs audit loop (operational checks)
各イテレーションで次を確認します。

1. 文書群が Overview → Tutorial → Scenario → Reference の導線でつながっているか。
2. 文書が上流正本と矛盾していないか。
3. 文書化で見つかったギャップが issue / ADR / requirements のいずれかに反映されたか。
4. スクリーンショット、サンプル、FAQ の追加が有益かを毎回見直したか。
5. scorecard（TFS / Decision Readiness / Support Deflection / Feedback Closure）が更新されたか。

### Docs audit checklist (runnable)
- **リンク監査（repo 内）**
  - `[]()` / 相対パスリンク / アンカーリンクを対象に、リンク切れ 0 件を完了条件とする。
  - リンク切れ検出時は、同一コミット内で「修正」または「一時無効化 + issue 起票」のどちらかを必須とする。
- **制約明示監査（Reference）**
  - 各 Reference Card に「仕様制約 / 運用制約 / 既知制約」が揃っているかを確認する。
  - 失敗ケースごとに「失敗時の一次対応」および「関連正本リンク」があることを確認する。
- **失敗時運用監査（監査プロセス自体）**
  - docs audit が時間内に完了しない場合は `Blocked` として記録し、未監査範囲を明記する。
  - 監査証跡（判定、未解決項目、次アクション、反映先リンク）を issue または scorecard に必ず残す。


## Operations templates and single workflow entry
Gate C（docs audit operations）と Gate D（KPI scorecard measurement）は、次のテンプレート実体へ接続して運用する。

1. docs audit 実行テンプレート: `01_Plans/templates/docs-audit-feedback-loop-template.md`
2. feedback loop 分類テンプレート: `01_Plans/templates/docs-feedback-classification-template.md`
3. 監査ログテンプレート: `01_Plans/templates/docs-audit-log-template.md`
4. KPI scorecard テンプレート: `01_Plans/templates/phase6-kpi-scorecard.md`
5. KPI scorecard サンプル: `01_Plans/templates/phase6-kpi-scorecard-sample.md`
6. 運用タスク管理: `01_Plans/issues/issue-0019-phase6-feedback-loop-operations.md`, `01_Plans/issues/issue-0020-phase6-value-kpi-and-audit-scorecard.md`

運用順序は固定で、次の 7 ステップを必須とする。

1. `Overview -> Tutorial -> Scenario -> Reference` の導線監査（Gate A）
2. Reference Card の品質監査（Gate B）
3. docs audit 実行（Gate C）
4. feedback loop 分類テンプレートへ転記（Gate C）
5. KPI scorecard 記録（Gate D）
6. `python3 01_Plans/tools/planning_queue.py` 実行による orphan / pending 可視化（Gate E）
7. issue-0019 / issue-0020 の Validation evidence 更新（Gate E の運用証跡）

## Traceability: issue-0018 acceptance mapping
`issue-0018-phase6-reference-trustworthiness.md` の受入条件に対して、本書の対応節を以下に固定する。

| issue-0018 Acceptance criteria | Architecture mapping |
|---|---|
| 主要パラメータ群に「正常系挙動」「代表的な失敗ケース」「関連正本リンク」が記載されること | Gate B: Reference trustworthiness（Reference Card 必須項目） |
| Smart Fallback / 印刷制御 / Diagnostics / Paste&D&D について制約が明文化されること | Gate B: Reference trustworthiness（対象機能の失敗シナリオ・制約分類） |
| `phase6-public-documentation-architecture.md` の quality gate と矛盾しないこと | Gate A〜E（authoritative gate）全体 |
| docs audit で参照リンク切れがないこと（少なくとも repo 内リンク） | Docs audit checklist (runnable) - リンク監査（repo 内） |

## Known limitations and deferred items
### Known limitations (current)
- docs lint / link check / scorecard 集計は現時点で手動運用を含む。
- 実機スクリーンショット収集は体系化途上であり、Coverage に揺らぎがある。
- FAQ / troubleshooting は独立文書として未分離で、導線改善余地がある。
- サンプル集 / テンプレート配布は限定的で、業務別バリエーションが不足している。

### Deferred items for later iterations
- 実機スクリーンショットの体系的収集。
- FAQ / troubleshooting 独立文書。
- サンプル集やテンプレート配布。
- docs lint / link check の自動化。
