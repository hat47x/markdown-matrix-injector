# ADR-0002: Phase 6 public documentation and feedback loop governance

- Status: Accepted
- Date: 2026-03-24
- Deciders: Project Maintainers
- Scope: `00_Prompt/requirements.md`, `01_Plans/`, `02_Architecture/`, `03_Implement/test`, `04_Documentation/`

## Context (背景と課題)
- Phase 5まででMarkdown Matrix Injectorの主要機能は実装されたが、一般利用者向けに価値を説明する公開文書体系は未整備である。
- 現状の公開文書は開発者セットアップやE2E手順に偏っており、「何ができるか」「誰に効くか」「どの順で試すか」「詳細仕様はどこにあるか」を一般利用者が追いにくい。
- 文書化は単なる成果物整理ではなく、曖昧な用語、欠けた前提条件、弱いUX導線、未検証の仕様を発見するレビュー装置としても機能する。

## Decision (決定事項)
- Phase 6では、公開文書を次の4層で整備する。
  1. **Overview**: プロダクトの課題設定、価値、主要機能、対象読者を短時間で理解させる。
  2. **Tutorial / Quickstart**: 最初の成功体験までを最短手順で案内する。
  3. **Scenario Guides**: SIer設計書移行、巨大表の別紙参照、レビュー・監査準備など、業務文脈ごとの使い方を示す。
  4. **Reference**: 記法、クエリ、Smart Fallback、印刷制御、Diagnostics、Paste / D&Dなどを正確に引ける詳細仕様を持つ。
- 公開文書は `04_Documentation/` に置き、設計判断は `02_Architecture/`、実行計画は `01_Plans/issues/`、要求水準は `requirements.md` に戻す。公開文書だけに仕様差分を閉じ込めない。
- 文書化イテレーションごとに、以下の観点でフィードバックを評価する。
  - 要件: 読者価値、対象ユーザー、品質ゲート、未記載の制約がrequirementsに反映されているか。
  - 設計: 情報アーキテクチャ、文書間リンク、サンプル戦略、スクリーンショット方針、正本の所在がarchitectureに固定されているか。
  - テスト: チュートリアルや仕様書で主張した内容をunit / integration / manual E2E / docs auditのどこで検証するか定義されているか。
- 各公開文書には少なくとも次を含める。
  - 対象読者
  - この文書で達成できること
  - 前提条件または利用シーン
  - 手順 / 例 / 期待結果
  - 関連する正本文書への導線
  - 既知の制約または次に読むべき文書

## Consequences (結果と影響)
- **Good:** 一般利用者が、概要→試用→業務適用→詳細仕様の順で迷わず学べる。
- **Good:** 文書化を通じて見つかった仕様ギャップを、requirements / architecture / test へ継続的に戻せる。
- **Good:** 公開文書が単なる README 断片ではなく、価値訴求と運用可能性を両立した体系になる。
- **Bad:** 文書追加時に、公開文書と内部文書の責務分離を毎回判断する必要がある。
- **Bad:** 文書とプロダクトの乖離を防ぐため、更新コストと docs audit の責務が増える。

## Traceability (関連情報)
- Related ADRs: `01_Plans/adr/ADR-0001-documentation-governance.md`
- Related Issues: `01_Plans/issues/issue-0015-phase6-public-docs-foundation.md`
- Related Docs: `02_Architecture/phase6-public-documentation-architecture.md`, `04_Documentation/README.md`

## 議事録 (AI読込不要)
### Issue Definition
- Phase 6の主対象を「公開文書作成」だけに留めるか、「文書化から得た知見の製品フィードバック」まで含めるかが未確定だった。

### Virtual Debate
- Architecture Lead: 文書体系だけ作ると仕様差分の置き場所が曖昧になる。requirements / architecture / testsへの逆流を運用ルールとして固定すべき。
- Product/UX Lead: 一般向け価値訴求が弱いと採用につながらない。概要・チュートリアル・シナリオ・詳細仕様の4層は最低限必要。
- QA/Delivery Lead: 文書が正しそうに見えても検証経路がないと危険。チュートリアルや仕様主張ごとに対応するtest / manual checkを結び付けるべき。

### Synthesis & Decision
- Phase 6は「公開文書体系の整備」と「文書化知見の上流反映」を不可分の1セットとして扱う。
- 公開文書は4層構造で整備し、文書化で見つかった曖昧さはrequirements / architecture / tests / issuesに戻す。
