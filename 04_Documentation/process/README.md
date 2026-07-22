# 04_Documentation/process — 開発プロセス・ガバナンス文書（トラック B）

このディレクトリは、MMI の**開発プロセスの記録**（リリース準備・運用信頼性・ルールテーブル運用・ガバナンス自動化）を集約します。
これらはフェーズ番号で索引された**プロセス文書**であり、製品の挙動そのものを理解する目的では
[トラック A（製品を理解する）](../README.md#ドキュメント地図最短経路) を先に参照してください。

> **配置変更の記録**: 本ディレクトリの文書は、以前は `04_Documentation/` 直下（`04_Documentation/phase7-release-readiness.md` 等）に置かれていました。
> 製品理解用の文書とプロセス文書を分離するため、`04_Documentation/process/` へ移設しました。
> 過去の Issue / ADR が旧パスを参照している場合は、同名ファイルを本ディレクトリに読み替えてください。

## 収録文書

| 文書 | 内容 | 決定正本（ADR） |
|---|---|---|
| [`phase7-release-readiness.md`](phase7-release-readiness.md) | リリースゲート・KPI・SLA の運用ガイド | [ADR-0005](../../01_Plans/adr/ADR-0005-phase7-release-readiness-and-adoption-scale.md) |
| [`phase8-operational-reliability.md`](phase8-operational-reliability.md) | 障害 triage / runbook / フィードバック還流の運用 | [ADR-0006](../../01_Plans/adr/ADR-0006-phase8-operational-reliability-and-supportability.md) |
| [`phase8-drools-inspired-table-patterns.md`](phase8-drools-inspired-table-patterns.md) | MMI 内部機能を題材にした Drools 参照の表パターンカタログ | [ADR-0007](../../01_Plans/adr/ADR-0007-phase9-rule-table-interoperability-and-design-assetization.md) |
| [`phase9-rule-table-template-operations.md`](phase9-rule-table-template-operations.md) | ルールテーブル・テンプレート資産の運用と docs/fixture 同期 | [ADR-0008](../../01_Plans/adr/ADR-0008-phase9-template-sync-quality-gate-hardening.md) |
| [`phase10-evidence-auto-harvest.md`](phase10-evidence-auto-harvest.md) | 証跡の自動収集基盤 | [ADR-0009](../../01_Plans/adr/ADR-0009-phase10-adoption-operations-governance-automation.md) |
| [`phase10-governance-reporting-foundation.md`](phase10-governance-reporting-foundation.md) | 週次ガバナンスレポートと KPI（ADR-0012 D6 再定義）の基盤 | [ADR-0009](../../01_Plans/adr/ADR-0009-phase10-adoption-operations-governance-automation.md) |

## 関連

- 文書ハブ（トラック A / B の地図）: [`../README.md`](../README.md)
- 製品の挙動を深く理解する: [`../how-it-works.md`](../how-it-works.md)
- 計画・ADR・Issue: [`../../01_Plans/README.md`](../../01_Plans/README.md)
- リリースゲート運用の詳細手順: 上記 `phase7-release-readiness.md` と `../README.md` の「Phase 6〜10 運用導線」
