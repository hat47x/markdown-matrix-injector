# Phase 6 Public Documentation Architecture

## Purpose
この文書は、Phase 6 で整備する公開文書の情報アーキテクチャと、文書化から requirements / design / test へ知見を戻す feedback loop を固定するための設計文書です。

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

## Quality gate for every public document
各公開文書には最低限、次の節を置きます。

- `## Target reader`
- `## Prerequisites`
- `## Expected result`
- `## Related docs`
- `## Known limitations`

手順書やシナリオ文書では、これに加えて「入力例」「実行手順」「期待される観測結果」を書きます。Reference 文書では、少なくともシンタックス、主なパラメータ、挙動、制約、関連文書リンクを表形式または箇条書きで持ちます。

## Docs audit loop
Phase 6 では docs audit を正式な検証トラックとして扱います。各イテレーションで次を確認します。

- 文書群が Overview → Tutorial → Scenario → Reference の導線でつながっているか。
- 文書が上流正本と矛盾していないか。
- 文書化で見つかったギャップが issue / ADR / requirements のいずれかに反映されたか。
- スクリーンショット、サンプル、FAQ の追加が有益かを毎回見直したか。

## Deferred items for later iterations
- 実機スクリーンショットの体系的収集。
- FAQ / troubleshooting 独立文書。
- サンプル集やテンプレート配布。
- docs lint / link check の自動化。
