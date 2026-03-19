# ADR-0000: ADR (Architecture Decision Record) 運用方針

- Status: Accepted
- Date: 2026-03-19
- Deciders: Project Maintainers
- Scope: `01_Plans/adr/`

## Context

プロジェクトが進行するにつれ、「なぜこの仕様になったのか」「なぜ他のライブラリを採用しなかったのか」といったコンテキストが失われがちである。
特にAIエージェントを伴走させる開発においては、過去の文脈を明文化した「単一の正本（Single Source of Truth）」が存在しないと、推測による仕様のブレや先祖返りが発生する。

## Decision

重要な技術的・仕様的決定は、すべて ADR (Architecture Decision Record) 形式で `01_Plans/adr/` に記録する。

### ADR 管理ルール

1. **命名規則**: `ADR-0000-short-title.md` のように、4桁の連番ゼロ埋め＋英語の小文字ケバブケースで作成する。
2. **テンプレートの厳守**: 新規作成時は必ず `TEMPLATE.md` をコピーして使用し、必須項目を省略しない。
3. **ステータス管理**: 
   - `Draft` (草案)
   - `Proposed` (提案中)
   - `Accepted` (承認・適用済み)
   - `Rejected` (却下)
   - `Superseded` (別のADRによって非推奨・上書きされた)
4. **イミュータブル原則**: 一度 `Accepted` になったADRは、誤字脱字の修正を除き、**後から内容を改変してはならない。** 決定を覆す場合は、新しいADRを起票し、旧ADRのステータスを `Superseded` に変更して相互リンクを貼ること。
