# 04_Documentation

このディレクトリは、利用者・導入担当者・運用担当者に公開する文書を格納する領域です。
セットアップ手順、運用手順、ユーザー向けガイド、公開可能な検証手順などを配置します。

## 公開文書の基本導線（Phase 6）
Phase 6 の公開文書は、**Overview -> Tutorial -> Scenario -> Reference（概要→チュートリアル→活用シナリオ→詳細仕様）** の順で読む構成に厳密統一します。
この順序は issue-0016 / issue-0019 の README 関連要求に基づく固定導線であり、README 単体で参照しても解釈がぶれないように運用します。

1. **Overview**: `04_Documentation/overview.md`
2. **Tutorial**: `04_Documentation/tutorial.md`
3. **Scenario**: `04_Documentation/scenario-sier-design-docs.md`
4. **Reference**: `04_Documentation/reference.md`

> 上記 1〜4 は公開導線の正本であり、Phase 6 の docs audit でもこの順序を固定します。
> Gate A（公開導線監査）はこの 1〜4 の並びを唯一の判定基準とします。

## FAQ / 視覚補助素材への導線（issue-0026）
Phase 6 の quality gate（FAQ・スクリーンショット/比較表評価）に対応するため、公開導線 4 文書の該当セクションを以下で固定します。

| 文書 | FAQ セクション | 視覚補助素材セクション |
|---|---|---|
| Overview | `## FAQ（Overview）` | `## 視覚補助素材（比較表）` |
| Tutorial | `## FAQ（Tutorial）` | `## 視覚補助素材（比較表）` |
| Scenario | `## FAQ（Scenario）` | `## ROI比較表（利用前 / 利用後）` |
| Reference | `## FAQ（Reference）` | （必要時に比較表を追加。現時点はパラメータ別箇条書きを正本とする） |

> スクリーンショットは manual-e2e の環境差異を受けやすいため、現時点では比較表を優先し、画像は安定した再現手順が確立した項目から段階追加する。

### スクリーンショット資産（issue-0027）
- 資産配置先: `04_Documentation/samples/screenshots/`
- 通常埋め込み: `phase6-normal-embed-preview.svg`（overview）
- Smart Fallback: `phase6-smart-fallback-card.svg`（tutorial）
- 印刷制御: `phase6-print-control-preview.svg`（tutorial）

## README 利用ガイド（前提・期待結果・関連文書・制約）
### 前提
- 本 README は `04_Documentation/` 配下の公開文書群を案内するハブとして利用します。
- 読者は最初に Overview から開始し、Tutorial / Scenario / Reference へ順送りで遷移します（逆順参照を標準導線にしません）。

### 期待結果
- 読者が次に読む文書を迷わず 1 ステップで特定できること。
- docs audit 実行時に、導線順・Gate 表現・feedback loop 接続先を README 単体で確認できること。

### 関連文書
- `01_Plans/issues/issue-0016-phase6-adoption-fast-path.md`（導線順固定の受入条件）
- `01_Plans/issues/issue-0019-phase6-feedback-loop-operations.md`（Gate A〜E / docs audit / feedback loop の運用要求）
- `02_Architecture/phase6-public-documentation-architecture.md`（quality gate の正本）

### 制約
- この README は導線と運用導線の正本リンクを示すことに限定し、詳細手順の本文を重複記載しません。
- 公開文書の記述ルール（対象読者・前提条件・期待結果・関連文書・既知の制約）は各文書本体で維持します。

## Gist 公開方針
- `04_Documentation/` の文書は、**すべて Markdown 形式で体系立てて記述**し、Gist ページとして公開する前提で管理します。
- README では「ローカル正本 (`04_Documentation/*.md`)」と「公開先 Gist」を 1 対 1 で対応付けます。
- Gist URL は公開後に実 URL へ差し替えます（下表はプレースホルダ）。

## 公開文書対応表（ローカル正本と Gist）
| 導線順 | 区分 | ローカル正本 | 公開 Gist ページ |
|---|---|---|---|
| 1 | Overview（概要） | `04_Documentation/overview.md` | [Gist: MMI Overview](https://gist.github.com/<YOUR_GITHUB_ACCOUNT>/mmi-overview) |
| 2 | Tutorial（チュートリアル） | `04_Documentation/tutorial.md` | [Gist: MMI Tutorial](https://gist.github.com/<YOUR_GITHUB_ACCOUNT>/mmi-tutorial) |
| 3 | Scenario（活用シナリオ） | `04_Documentation/scenario-sier-design-docs.md` | [Gist: MMI SIer Scenario Guide](https://gist.github.com/<YOUR_GITHUB_ACCOUNT>/mmi-scenario-sier-design-docs) |
| 4 | Reference（詳細仕様） | `04_Documentation/reference.md` | [Gist: MMI Reference](https://gist.github.com/<YOUR_GITHUB_ACCOUNT>/mmi-reference) |
| - | 開発者セットアップ | `04_Documentation/developer-setup.md` | [Gist: MMI Developer Setup](https://gist.github.com/<YOUR_GITHUB_ACCOUNT>/mmi-developer-setup) |
| - | VSCode E2E ガイド | `04_Documentation/vscode-e2e-testing.md` | [Gist: MMI VSCode E2E Guide](https://gist.github.com/<YOUR_GITHUB_ACCOUNT>/mmi-vscode-e2e-testing) |
| - | Phase 7 Release Readiness | `04_Documentation/phase7-release-readiness.md` | [Gist: MMI Phase7 Release Readiness](https://gist.github.com/<YOUR_GITHUB_ACCOUNT>/mmi-phase7-release-readiness) |
| - | Phase 8 Operational Reliability | `04_Documentation/phase8-operational-reliability.md` | [Gist: MMI Phase8 Operational Reliability](https://gist.github.com/<YOUR_GITHUB_ACCOUNT>/mmi-phase8-operational-reliability) |
| - | Phase 8 Drools Pattern Catalog | `04_Documentation/phase8-drools-inspired-table-patterns.md` | [Gist: MMI Phase8 Drools Pattern Catalog](https://gist.github.com/<YOUR_GITHUB_ACCOUNT>/mmi-phase8-drools-pattern-catalog) |
| - | Phase 9 Rule Table Template Operations | `04_Documentation/phase9-rule-table-template-operations.md` | [Gist: MMI Phase9 Rule Table Template Operations](https://gist.github.com/<YOUR_GITHUB_ACCOUNT>/mmi-phase9-rule-table-template-operations) |
| - | Phase 9 表パターンガイド（ツール非依存、ADR-0013） | `04_Documentation/samples/phase9-rule-table-pattern-guide.md` | [Gist: MMI Phase9 Pattern Guide](https://gist.github.com/<YOUR_GITHUB_ACCOUNT>/mmi-phase9-pattern-guide) |
| - | 総合サンプル Markdown | `04_Documentation/samples/mmi-full-spec-sample.md` | [Gist: MMI Full Spec Sample Markdown](https://gist.github.com/<YOUR_GITHUB_ACCOUNT>/mmi-full-spec-sample-markdown) |

## Phase 6 運用導線（テンプレート・統制）
運用を一本化するため、quality gate・docs audit・feedback loop・scorecard は次の正本に接続します。

1. Governance / quality gate（正本）
   - `02_Architecture/phase6-public-documentation-architecture.md`（Gate A〜E）
2. Feedback loop operations（issue）
   - `01_Plans/issues/issue-0019-phase6-feedback-loop-operations.md`
3. KPI scorecard operations（issue）
   - `01_Plans/issues/issue-0020-phase6-value-kpi-and-audit-scorecard.md`
4. 実運用テンプレート（実体ファイル）
   - `01_Plans/templates/docs-audit-feedback-loop-template.md`
   - `01_Plans/templates/docs-feedback-classification-template.md`
   - `01_Plans/templates/docs-audit-log-template.md`
   - `01_Plans/templates/phase6-kpi-scorecard.md`
   - `01_Plans/templates/phase6-kpi-scorecard-sample.md`
5. triage 可視化
   - `python3 01_Plans/tools/planning_queue.py`

### 運用手順（固定順序）
1. Gate A: 公開導線監査（Overview -> Tutorial -> Scenario -> Reference）
2. Gate A / B の差分監査（構成・Reference 信頼性）
3. Gate C: docs audit を実施し、requirements / architecture / test / product gap へ分類
4. Gate D として scorecard（TFS / Decision Readiness / Support Deflection / Feedback Closure）を更新
5. Gate E として `python3 01_Plans/tools/planning_queue.py` を実行し、orphan / pending を確認


## Phase 7 運用導線（Release Readiness）
Phase 7 では「実装追加」よりも「リリース判定と採用観測の再現性」を優先し、以下を正本導線として固定します。

1. Release gate / KPI / SLA 運用ガイド
   - `04_Documentation/phase7-release-readiness.md`
2. Decision 正本（方針）
   - `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`
3. Action 正本（実行）
   - `01_Plans/issues/issue-0043-phase7-release-readiness-foundation.md`
4. 自動ゲート確認（G1/G2/G3）
   - `python3 01_Plans/tools/release_gate_check.py`
5. triage 可視化
   - `python3 01_Plans/tools/planning_queue.py`

## Phase 8 運用導線（Operational Reliability & Supportability）
Phase 8 では「障害を早く直せる運用」と「文書改善を製品品質に還流する仕組み」を正本導線として固定します。

1. Triage / runbook / feedback 運用ガイド
   - `04_Documentation/phase8-operational-reliability.md`
2. Drools 参照の表パターン定義（文書/テストデータ、**MMI 自身の内部機能を題材にしたケーススタディ**。
   汎用テンプレートは Phase 9 の表パターンガイドを参照）
   - `04_Documentation/phase8-drools-inspired-table-patterns.md`
3. Decision 正本（方針）
   - `01_Plans/adr/ADR-0006-phase8-operational-reliability-and-supportability.md`
4. Action 正本（実行）
   - `01_Plans/issues/issue-0065-phase8-operational-reliability-foundation.md`
5. triage 可視化
   - `python3 01_Plans/tools/planning_queue.py`

## Phase 9 運用導線（Rule Table Interoperability & Design Assetization）
Phase 9 では「テンプレート資産の再利用性」と「docs/fixture 双方向同期」を同時に満たす運用を正本導線として固定します。

1. テンプレート運用ガイド
   - `04_Documentation/phase9-rule-table-template-operations.md`
2. ベンチマークテンプレート（docs）
   - `04_Documentation/samples/phase9-rule-table-benchmark-pack.csv`
3. ベンチマークテンプレート（test fixture）
   - `03_Implement/test/fixtures/workspace/data/phase9-rule-table-benchmark-pack.csv`
4. 同期監査コマンド
   - `python3 01_Plans/tools/check_phase9_template_sync.py`
5. query 観測テスト
   - `cd 03_Implement && npm test`
6. release gate（G1/G2/G3）
   - `python3 01_Plans/tools/release_gate_check.py`
   - 行順差分のみ許容する監査では `python3 01_Plans/tools/release_gate_check.py --phase9-ignore-row-order`
   - `--skip-tests` 併用時は G3 detail が `skipped by --skip-tests`（strict）または `skipped by --skip-tests (ignore-row-order not evaluated)`（relaxed指定時）となる
7. triage 可視化
   - `python3 01_Plans/tools/planning_queue.py`

### Phase 9 表パターンガイド（ツール非依存公開、ADR-0012 D7 / ADR-0013）
- 標準ガイド（生成物）: `04_Documentation/samples/phase9-rule-table-pattern-guide.md`
- 生成スクリプト: `python3 01_Plans/tools/generate_phase9_pattern_guide.py`
- ドリフト検知: `python3 01_Plans/tools/generate_phase9_pattern_guide.py --check`
- docs CSV 更新時は fixture CSV 同期に加え、本ガイドも同一コミットで再生成する（3点 round-trip、
  `phase9-rule-table-template-operations.md` §2.0.1 参照）。
- 既存の sync checker / release gate G3 / `markdownMatrixPlugin.test.ts` はこのガイド追加によって
  一切変更しない（純粋加算）。

## 文書運用ポリシー（再確認）
- `04_Documentation/` 配下の公開文書は、英語交じりの文体を避け、標準的な日本の技術書に準じた章立て・用語・文体で記述する。
- 公開文書だけに仕様差分を閉じ込めず、要件は `00_Prompt/requirements.md`、設計は `02_Architecture/`、計画は `01_Plans/` に戻します。
- 各文書は少なくとも対象読者、前提条件、期待結果、関連文書、既知の制約を明示します。

## 総合サンプル資産
- 総合サンプル Markdown: `04_Documentation/samples/mmi-full-spec-sample.md`
- 総合サンプル Excel（生成物）: `04_Documentation/samples/mmi-full-spec-sample.xlsx`
- Excel 生成スクリプト: `04_Documentation/samples/generate_mmi_full_spec_sample_xlsx.py`

この 2 つをセットで使うことで、Phase 1〜5 の主要仕様（基本記法、クエリ変換、印刷制御、Smart Fallback、Phase 5 手動確認観点）を通しで再現できます。

> Codex/GitHub PR 制約（バイナリ非対応）により `.xlsx` はリポジトリへ含めず、上記 generator script で人手生成する運用とします。
