# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

MMI プロジェクトはセキュリティを重視しています。脆弱性を発見された場合は、以下の手順で報告してください。

### 報告手順

1. **公開 Issue での報告は避けてください。**
2. GitHub の [Security Advisories](https://github.com/hat47x/markdown-matrix-injector/security/advisories/new) から非公開で報告してください。
3. または、リポジトリオーナー（`hat47x`）に直接連絡してください。

### 報告に含める情報

- 脆弱性の種類と影響範囲
- 再現手順（可能な場合）
- 影響を受けるバージョン
- 推奨される修正方法（任意）

### 対応方針

- 報告から **7 日以内**に初回応答を行います。
- 重大度の評価と修正計画を報告者と共有します。
- 修正リリース後、報告者の同意を得てから詳細を公開します。

## 設計上の保証と既知の制限

MMI のアーキテクチャは以下のセキュリティ特性を提供します：

- **Read-only MUST（構造的保証）**: 参照経路から正本データを改変することは構造的に不可能です
  （レンダリングパイプライン `src/core/` / `src/plugin/` / `src/cache/` に書き込み操作は一切存在せず、
  自動テストでも原本の非改変を検証しています）。
- **ネットワーク非到達（構造的保証）**: コアにネットワーク取得は存在せず、リモートソースは仕様レベルで非対応です。
- **Visible degradation MUST**: 未対応環境・リンク切れは黙って消えず、可視なエラーとして表示されます。

**Containment（2026-07-15 実装完了）**: 仕様（MMI Notation v1 P4）に従い、パス解決はワークスペース
境界内に限定されます。`..` セグメントによる境界外への遡上（例: `../../../../etc/hosts`）は
`PathContainmentError` として拒否され、可視エラーとして表示されます。境界の定義は
`workspaceRoot`（設定時）または Markdown ファイル自身のディレクトリ（非ワークスペース時）です。
実装とテストは `src/core/pathResolver.ts` / `test/pathResolver.test.ts`（10 件、symlink bypass 含む）に
あります。

これらの記述は ADR-0012（MMI Notation v1 規範原則）と実装の実測に基づきます。
