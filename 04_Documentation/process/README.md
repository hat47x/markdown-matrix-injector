# 04_Documentation/process — 開発プロセス・ガバナンス文書（トラック B）

このディレクトリには、MMIの開発プロセスに関する記録をまとめています。対象はリリース準備、運用信頼性、ルールテーブルの運用、統治業務の自動化です。
ここにあるのは、開発段階ごとにまとめたプロセス文書です。製品がどのように動くかを知りたい場合は、先に[トラックA（製品を理解する）](../README.md#ドキュメント地図最短経路)を参照してください。

> 配置変更の記録：これらの文書は以前、`04_Documentation/`直下（`04_Documentation/phase7-release-readiness.md`など）に置かれていました。
> 製品を理解するための文書と開発プロセスの文書を区別するため、`04_Documentation/process/`へ移しました。
> 過去のIssueやADRが移動前のパスを参照している場合は、このディレクトリの同名ファイルを確認してください。

## 収録文書

| 文書 | 内容 | 決定正本（ADR） |
|---|---|---|
| [`phase7-release-readiness.md`](phase7-release-readiness.md) | リリース判定条件、KPI、SLAの運用ガイド | [ADR-0005](../../01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md) |
| [`phase8-operational-reliability.md`](phase8-operational-reliability.md) | 障害の優先順位付け、運用手順書、フィードバックを改善へ反映する運用 | [ADR-0006](../../01_Plans/adr/ADR-0006-phase8-operational-reliability-and-supportability.md) |
| [`phase8-drools-inspired-table-patterns.md`](phase8-drools-inspired-table-patterns.md) | MMI 内部機能を題材にした Drools 参照の表パターンカタログ | [ADR-0007](../../01_Plans/adr/ADR-0007-phase9-rule-table-interoperability-and-design-assetization.md) |
| [`phase9-rule-table-template-operations.md`](phase9-rule-table-template-operations.md) | ルールテーブルとひな形の運用、文書と試験用データの同期 | [ADR-0008](../../01_Plans/adr/ADR-0008-phase9-template-sync-quality-gate-hardening.md) |
| [`phase10-evidence-auto-harvest.md`](phase10-evidence-auto-harvest.md) | 証跡の自動収集基盤 | [ADR-0009](../../01_Plans/adr/ADR-0009-phase10-adoption-operations-governance-automation.md) |
| [`phase10-governance-reporting-foundation.md`](phase10-governance-reporting-foundation.md) | 週次の統治レポートとKPIを作成する基盤（ADR-0012のD6による再定義） | [ADR-0009](../../01_Plans/adr/ADR-0009-phase10-adoption-operations-governance-automation.md) |

## 関連

- 文書案内（トラックAとBの関係）: [`../README.md`](../README.md)
- 製品の動作を詳しく知る: [`../how-it-works.md`](../how-it-works.md)
- 計画・ADR・Issue: [`../../01_Plans/README.md`](../../01_Plans/README.md)
- リリース判定の詳しい運用手順: 上記 `phase7-release-readiness.md` と `../README.md` の「Phase 6〜10運用導線」
