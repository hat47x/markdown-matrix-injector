# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.3.x   | :white_check_mark: |
| 0.2.x以前 | :x:              |

0.x の間は、最新の minor 版（現行は `03_Implement/package.json` の版）だけを修正の対象にします。古い版で見つかった
問題は、最新版で再現するかを確かめたうえで報告してください。

## Reporting a Vulnerability

MMIプロジェクトはセキュリティを重視しています。脆弱性を発見された場合は、以下の手順で報告してください。

### 報告手順

1. 公開Issueでの報告は避けてください。
2. GitHubの [Security Advisories](https://github.com/hat47x/markdown-matrix-injector/security/advisories/new) から非公開で報告してください。
3. または、リポジトリオーナー（`hat47x`）に直接連絡してください。

### 報告に含める情報

- 脆弱性の種類と影響範囲
- 再現手順（可能な場合）
- 影響を受けるバージョン
- 推奨される修正方法（任意）

### 対応方針

- 報告から 7日以内に初回応答を行います。
- 重大度の評価と修正計画を報告者と共有します。
- 修正リリース後、報告者の同意を得てから詳細を公開します。

## 設計上の保証と既知の制限

MMIのアーキテクチャは以下のセキュリティ特性を提供します。

- **Read-only MUST（参照経路）**: 表の参照・展開・観測の経路（レンダリング、MCPの各ツール、`inspect`・`select`・`find`・`render`）は、
  原本を読むだけで書き換えません。`src/core/` / `src/plugin/` / `src/cache/` / `src/parser/` / `src/adapters/` /
  `src/navigate/` でファイルへ書き込むAPI（`writeFileSync`・`createWriteStream`・`mkdirSync`・`unlinkSync`・
  `renameSync`・`rmSync`等）を呼べるのは、次の3ファイルだけです。この一覧は `test/readOnlyStructure.test.ts` が
  ソースを走査して固定しており、増やすと試験が失敗します。
  - `src/core/importLedger.ts`：取込台帳とその書込みロック（利用者が台帳の更新を求めたときだけ書く）。
  - `src/core/candidateReviewDecisions.ts`：Candidateの判断記録（利用者が出力先を指定したときだけ書く）。
  - `src/core/cognitiveArtifact.ts`：成果物のキャッシュ（研究層。製品の参照経路では使わない）。
  上記以外の書込み（`src/application/`・`src/converters/`・`src/snapshot/`・`src/search/observation/`・`src/cli/`）は
  この試験の対象外で、「構造的に不可能」とは言えません。明示した出力先・`--write`・`--commit`等を伴うコマンドに限ります。
  この試験はソース上のAPI呼出しの有無を見る静的な検査であり、動的な呼出し（`fs[name]`等）や子プロセス経由の書込みは検出しません。
  原本の非改変は、MCPについて `test/mcpServer.test.ts` が読取り前後で確かめています。
- **ネットワーク非到達**: `src/`にネットワーク取得（`node:http(s)`・`fetch`・`node:net`・`node:dns`）の呼出しはなく、リモートソースは仕様レベルで非対応です。この呼出しの不在は、現時点では試験で固定していません。
- **Visible degradation MUST**: 未対応環境・リンク切れは黙って消えず、可視なエラーとして表示されます。

**Containment（2026-07-15実装完了）**: 仕様（MMI Notation v1 P4）に従い、パス解決はワークスペース
境界内に限定されます。`..` セグメントによる境界外への遡上（例: `../../../../etc/hosts`）は
`PathContainmentError` として拒否され、可視エラーとして表示されます。境界の定義は
`workspaceRoot`（設定時）またはMarkdownファイル自身のディレクトリ（非ワークスペース時）です。
実装とテストは `src/core/pathResolver.ts` / `test/pathResolver.test.ts`（symlink bypassを含む）に
あります。

これらの記述はADR-0012（MMI Notation v1規範原則）と実装の実測に基づきます。
