# Issue: MMI Notation v1 仕様書と conformance corpus の起草

## Meta
- Type: Feature
- Status: Open
- Priority: High
- Scope: 04_Documentation/spec/mmi-notation-v1.md (新規), 04_Documentation/spec/params.schema.json (新規), 03_Implement/test/conformance/** (新規)
- Expected verification level: unit (corpus を参照実装で全件実行) + docs-check

## Traceability
- Related Backlog/Phase: ADR-0012 D2/D3/D4（conformance levels・8 規範原則・エコシステム互換）/ requirements Phase 12（issue-0101 で定義）
- Related ADR/Spec: `01_Plans/adr/ADR-0012-mission-redefinition-notation-as-governance-boundary.md`
- Depends on: issue-0101（上流の使命文が確定してから公開仕様を書く）

## 背景
ADR-0012 は記法を一級の公開仕様として独立させることを決定した。仕様が「広く受け入れられる」ための要件は
議事録のステークホルダー要求に集約されている: 段階的準拠（L0–L3）、可視な劣化、決定論、封じ込め、前方互換、
安定診断コード、i18n 中立（Delivery Profile 分離）、機械可読契約（Schema + corpus）。

## Execution Plan
### Proposed solution
1. `04_Documentation/spec/mmi-notation-v1.md` を起草（日英併記、RFC 2119 語彙）:
   - 構文（ABNF 相当）、target/sheet/range/params の解決規則
   - Conformance levels L0–L3 と各レベルの MUST/SHOULD 一覧
   - **Degradation classes**: CommonMark 素通し時・Obsidian 上・Markdown テーブル内 `|` 衝突時の期待劣化と escaping 規則
   - セキュリティ境界（read-only / containment / no-network-in-core）、リモートソース拡張の opt-in 規約
   - 診断コード一覧（安定 API）、`x-` 実験名前空間、SemVer ポリシー
2. `params.schema.json`: 全クエリパラメータの JSON Schema（agent 教示・実装検証用）。
3. `03_Implement/test/conformance/`: corpus 骨格（`case-*.md` 入力 + 期待論理表/期待診断の宣言）。参照実装のテストランナーで全件実行し、
   corpus と実装の一致を CI で担保（Phase 9 の資産化方針を継承）。
4. 既存 unit（176 件）から仕様例に昇格できるケースを corpus へ移植し、二重管理を避ける参照構造にする。

### Acceptance criteria
- [ ] 仕様書が L0–L3・8 規範原則・degradation classes・診断コードを規範表現（MUST/SHOULD）で規定している。
- [ ] JSON Schema が現行実装の全パラメータを網羅し、`previewStyles.test.ts` 同様のカバレッジ固定 unit を持つ。
- [ ] conformance corpus が最低: 正常系（L1/L2 各機能）、劣化系（未知パラメータ無視・不正値の安全劣化）、境界系（空範囲・巨大表 fallback）を含む。
- [ ] 参照実装が corpus 全件 pass（`npm test` に組み込み）。
- [ ] 日本語固有概念（別紙・納品）が core 章に現れず Delivery Profile 章に隔離されている。

### Validation plan
- `npm run build` / `npm test` exit 0（corpus ランナー含む）
- docs-check: spec 内リンク・用語が requirements / ADR-0012 と整合
