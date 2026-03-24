# Phase 6 Public Documentation Architecture

## Purpose
この文書は、Phase 6 で整備する公開文書の情報アーキテクチャと、文書化から requirements / architecture / test へ知見を戻す feedback loop を固定するための設計文書です。
本書は `issue-0018` / `issue-0019` / `issue-0020` の quality gate 要件を統合した、Phase 6 quality gate の正本として扱います。

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
- 各公開文書は最低限、以下の節を持つ。
  - `## Target reader`
  - `## Prerequisites`
  - `## Expected result`
  - `## Related docs`
  - `## Known limitations`
- 手順書 / シナリオ文書は「入力例」「実行手順」「期待される観測結果」を含める。
- Reference は「シンタックス」「主なパラメータ」「挙動」「制約」「関連正本リンク」を機能単位で保持する。
- 公開文書間の導線は Overview → Tutorial → Scenario → Reference の順で到達可能とする。

### Gate B: Reference trustworthiness
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
- docs audit は単発でなく定常運用とし、docs 更新イテレーションごとに実施する。
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
- Phase 6 KPI は以下の 4 指標を毎イテレーションで計測可能であること。
  - **TFS**
  - **Decision Readiness**
  - **Support Deflection**
  - **Feedback Closure**
- scorecard には最低限、以下を保持する。
  - 測定日
  - 対象文書
  - 判定
  - 次アクション
  - 反映先リンク（requirements / architecture / tests / issue）
- issue-0016〜0019 成果を最低 1 回は scorecard で評価可能であること。

### Gate E: Traceability and planning integrity
- docs 変更コミットごとに「発見事項 → 分類 → 反映先」を追跡可能にする。
- `01_Plans/tools/planning_queue.py` 実行時に orphan / pending 状態が観測できる運用を維持する。
- quality gate の判定ログは、後続イテレーションが再利用できる粒度で残す。

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
