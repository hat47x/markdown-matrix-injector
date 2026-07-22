# 02_Architecture

このディレクトリは Markdown Matrix Injector の技術設計・I/F・データフローを管理するための領域です。
実装前に固定化したい設計判断やモジュール構造の説明を配置します。

## 現行アーキテクチャの正本

拡張の**現在の**エンドツーエンド挙動（パーサ → パス解決 → 読込／キャッシュ → Smart Fallback →
変換パイプライン → 描画 → 診断）と責務マップ・Mermaid 図・コードマップは、次の 1 本に集約しています。

- [`../04_Documentation/how-it-works.md`](../04_Documentation/how-it-works.md) — **MMI 動作リファレンス（How It Works）**

新しくコードを読む・設計判断の背景を知る場合は、まずこの文書を参照してください。

## この領域の文書

| 文書 | 位置づけ |
|---|---|
| [`phase1-core-engine.md`](phase1-core-engine.md) | Phase 1〜2 時点のコアエンジン設計スナップショット（**歴史的記録**。現行の全体像は上記 How It Works を参照） |
| [`phase6-public-documentation-architecture.md`](phase6-public-documentation-architecture.md) | 公開文書の品質ゲート（Gate A〜E）の正本 |
| [`vscode-extension-host-e2e.md`](vscode-extension-host-e2e.md) | 拡張ホスト E2E 自動化のスコープと設計 |

> 設計判断の**決定記録**は [`../01_Plans/adr/`](../01_Plans/adr/)（ADR）に、
> 記法の**規範仕様**は [`../04_Documentation/spec/mmi-notation-v1.md`](../04_Documentation/spec/mmi-notation-v1.md) にあります。
