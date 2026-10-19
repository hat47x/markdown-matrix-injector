# Phase 7 リリース運用品質ガイド

Phase 7で定めたリリース判定、導入KPIの記録、文書監査からの改善手順を説明します。後続のADR-0012 D6で再定義されたKPIと、Phase 7当時の指標は区別して参照してください。

## 対象読者
- リリース可否を判定するMaintainer
- docs auditと改善へのフィードバックを運用するDocumentation担当
- query-evidence artifactを根拠に導入状況を評価するProduct / QA担当

## 前提条件
- `00_Prompt/requirements.md` にPhase 7が定義されていること。
- `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md` がAcceptedであること。
- `03_Implement/` のunit testを実行可能なローカル環境であること。

## 期待結果
- リリース可否を同一チェックリストで判定できる。
- query-evidence artifactから採用KPIを毎回同じ算出式で記録できる。
- docs auditで見つかった課題をSLA内に上流へ還流できる。

## 関連文書
- `.github/workflows/ci.yml`（release-gate job）
- `.github/workflows/release-gate-manual.yml`（手動workflow_dispatch実行）
- `00_Prompt/requirements.md`（Phase 7要件）
- `01_Plans/tools/release_gate_check.py`（Phase 7最小release gate自動実行）
- `01_Plans/tools/release_gate_metrics.py`（release gate JSONからKPI CSVを生成）
- `01_Plans/tools/release_gate_clean.py`（release gate生成物のクリーンアップ）
- `01_Plans/tools/phase7_issue_rollup.py`（Phase 7 issueステータス集計）
- `01_Plans/tools/release_gate_assert_artifacts.py`（必須artifact存在チェック）
- `01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md`（運用方針）
- `01_Plans/issues/issue-0043-phase7-release-readiness-foundation.md`（初回実行タスク）
- `04_Documentation/README.md`（公開導線と運用導線）

## 既知の制約
- 本ガイドの記載時点では `npm run lint` が未定義のため、release gateは `release_gate_check.py`（G1/G2/G3:Phase9Sync）とドキュメント導線レビューを組み合わせて運用する。
- 導入KPIの母集団はquery-evidence exportを実施した案件に限定される。

---

## 1. Release gate checklist（固定）

次のG1〜G6を共通の判定表として使用します。G1〜G3の自動判定とG4〜G6の人手レビューを、後述の順序で実施する運用手順です。

| Gate | 必須チェック | 実行コマンド/証跡 | 合格条件 |
|---|---|---|---|
| G1: Planning Integrity | pending/orphan の整合 | `python3 01_Plans/tools/planning_queue.py` | orphan=0、対象issueが traceable |
| G2: Test Integrity | unit test 回帰 | `cd 03_Implement && npm run test:unit` | fail=0 |
| G3: Phase9 Sync Integrity | docs/fixture の品質監査（機械判定） | `python3 01_Plans/tools/release_gate_check.py` | `G3:Phase9Sync` が PASS |
| G4: Documentation Integrity | 公開導線と運用導線の整合 | `04_Documentation/README.md` の導線確認 | 導線リンク切れなし |
| G5: Evidence Integrity | issue の Validation evidence 更新 | issue本文 | 実行日・コマンド・結果が記録済み |
| G6: Decision Integrity | ADR/issue の責務分離 | ADR/issue 差分レビュー | 方針=ADR、実行=issue を維持 |

### 判定フロー
以下は判定時に実施する手順です。今回の文書修正でコマンドを実行した記録ではありません。

1. まず `python3 01_Plans/tools/release_gate_check.py` を実行し、G1/G2/G3（Phase9Sync）を自動判定する。
   - `03_Implement` 配下では `npm run release:gate`（証跡保存時は `npm run release:gate:artifacts`、CSVまで含む場合は `npm run release:gate:full`）を利用できる。
   - release-gate toolingのunit testは `npm run test:release-gate-tools` で実行する。
   - 既存証跡を掃除する場合は `npm run release:gate:clean` を実行する。
   - JSON出力が必要な場合は `--format json` を併用する。
   - Phase9の行順差分を許容したい場合は `--phase9-ignore-row-order` を併用する。
   - `--skip-tests` と `--phase9-ignore-row-order` を同時指定した場合、G3 detailは `skipped by --skip-tests (ignore-row-order not evaluated)` となる。
   - 証跡を保存する場合は `--output-file artifacts/release-gate.json` を指定する。
   - 人手レビュー用には `--output-markdown-file artifacts/release-gate.md` を併用する。
   - 長時間実行を避ける必要がある場合は `--planning-timeout-sec` / `--npm-test-timeout-sec` を調整する。
2. 続けてG4 → G5 → G6を人手レビューで確認する。
   - docs-onlyの暫定確認では `--skip-tests` を使用できるが、最終release判定では禁止する。
3. G1 → G6の順序は固定とし、途中スキップを禁止する。
4. 開発中にpending issueを許容して確認したい場合のみ `--allow-pending-issues` を使う。
5. 1つでも不合格があればrelease判定は `No-Go`。
6. `No-Go` の原因はissueのTask breakdownへ逆流し、再実行時に再判定する。
7. CIでは `.github/workflows/ci.yml` の `release-gate` jobが `npm run test:release-gate-tools` の後に `npm run release:gate:full` を実行し、artifact assert通過後に `artifacts/release-gate.json` / `artifacts/release-gate.md` / `artifacts/release-gate-metrics.csv` / `artifacts/phase7-issue-rollup.md` を成果物として保存する。
8. CIでは重複実行を避けるため、`npm test` はrelease-gate job側（G2）を正本とする。
9. 手動実行が必要な場合は `Release Gate Manual` workflowからtimeout / pending / skipオプションを指定して同等チェックを実行する。
10. manual workflowでも `npm run test:release-gate-tools` を先行実行し、ユーティリティ回帰を検知してから本実行へ進む。

---

## 2. Adoption KPI 観測手順（query-evidence artifact 利用）

### 2.1 計測対象
- **導入時間短縮 (Onboarding Lead Time)**
- **リンク不整合の早期検知率 (Early Link Mismatch Detection)**
- **印刷再現性 (Print Reproducibility)**

### 2.2 データソース
- query-evidence JSON / Markdown artifact
- release-gate-metrics CSV（`artifacts/release-gate-metrics.csv`）
- phase7 issue rollup（`artifacts/phase7-issue-rollup.md`）
- docs auditログ
- 手動E2Eの実行記録（印刷確認）

### 2.3 KPI算出ルール
1. 導入時間短縮
   - 定義: `初回セットアップ完了時刻 - 作業開始時刻`
   - 比較: Phase 6ベースライン比で改善率（%）を算出。
2. リンク不整合の早期検知率
   - 定義: `レビュー前に検知できたリンク不整合件数 / 総リンク不整合件数`
   - 根拠: diagnostics / query-evidenceの検出ログ。
3. 印刷再現性
   - 定義: `再現成功件数 / 印刷検証総件数`。
   - 成功条件: pageBreak / orientation / fallback表示が期待通り。

### 2.4 記録テンプレート（最小項目）
- 実行日 (UTC)
- 対象文書/案件ID
- query-evidence artifactパス
- KPI 3指標の実測値
- 判定（改善 / 維持 / 悪化）
- 次アクション（issue起票先）

### 2.5 KPI redefinition (ADR-0012 D6)

この節は、Phase 7の従来指標を後続の週次運用にそのまま適用しないための区別です。

> **注記**: 上記 2.1〜2.4 は Phase 7 時点の計測アプローチの歴史的記録として残す（書き換えない）。
> Phase 10 の週次ガバナンスレポート運用は、以降 ADR-0012 D6 で再定義された 3 KPI
> （駆逐されたコピー重複 / 正本と文書の乖離インシデント / 表変更のレビュー所要時間）を使用する。
> 詳細な契約とサンプルは `04_Documentation/process/phase10-governance-reporting-foundation.md` を参照。

記録テンプレート（D6 KPI版、2.4と同型で拡張）:
- 実行日 (UTC)
- 対象文書/案件ID
- 根拠（query-evidence artifactパス / レビュー記録等）
- 実測値: 駆逐されたコピー重複（件数） / 正本と文書の乖離インシデント（件数） / 表変更のレビュー所要時間（時間）
- 判定（改善 / 維持 / 悪化）
- 次アクション（issue起票先）

---

## 3. docs audit -> 上流還流 SLA

文書監査で判明した課題は、修正先の責任に応じて次の期限と担当へ振り分けます。

| 区分 | 期限 (SLA) | 責任 | 還流先 |
|---|---|---|---|
| requirements 変更が必要 | 3営業日以内に草案 | Product/Architecture Lead | `00_Prompt/requirements.md` + ADR |
| 設計調整が必要 | 3営業日以内に設計差分 | Architecture Lead | `02_Architecture/` |
| テスト観点不足 | 2営業日以内に issue 起票 | QA/Delivery Lead | `03_Implement/test` + `01_Plans/issues/` |
| 文書導線/表現改善 | 2営業日以内にPR化 | Documentation Lead | `04_Documentation/` |

### 運用ルール
1. docs audit実施日をDay 0とし、SLAをカウントする。
2. SLA超過が発生した場合は、当該issueのPriorityを引き上げる。
3. 複数区分に跨る課題は「最短SLA」を適用する。
