# Issue: MMI Notation v1 仕様書と conformance corpus の起草

## Meta
- Type: Feature
- Status: Done
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
- [x] 仕様書 `04_Documentation/spec/mmi-notation-v1.md`（1.0.0-draft.1）が L0–L3・8 規範原則（P1–P8）・劣化クラス（D0–D2）・診断コード（§9 安定 API）を RFC 2119 語彙で規定。パイプライン順序（slice→columns→transpose→header→grep）を実装事実どおり規範化し、テーブル内 `|` 非対応等の構文制約も §3.2 で正直に明記。
- [x] `params.schema.json` が実装 12 パラメータを全網羅。カバレッジ固定 unit（`conformance.test.ts`: schema ⊇ `AUTOCOMPLETE_QUERY_PARAM_CANDIDATES`、`additionalProperties: true` を P5 として固定）を追加。
- [x] conformance corpus 19 ケース（core 4 / L1 4 / L2 9 / L3 2）: 正常系（header/range/columns/grep/transpose/highlight/format）、劣化系（未知キー無視・`x-` 名前空間・不正 pageBreak/orientation の安全劣化）、境界系（grep 0 件・列 11・セル 520 fallback・シート未指定）、エラー可視性（file/sheet/generic-xml）、block 描画（no-`<p>`-wrap）。
- [x] 参照実装が corpus 全 19 件 pass（`npm test` へ自動組込・**197 pass / 0 fail**、初回から全緑＝仕様と実装の無乖離を確認）。
- [x] 別紙・納品・改ページ・向きは §8.1 Delivery Profile に隔離（core 章に出現しない）。
- [x] 導線整備: README「なぜ規約なのか」から spec/schema/corpus/ADR-0012 へリンク、reference.md が仕様書を挙動記述の正本と宣言。

### 既存 unit との関係（二重管理の回避方針）
既存 unit のうち仕様例に値する挙動（transpose+header 数値、columns+grep、fallback 閾値等）は corpus 側へ**規範例として再宣言**した。
既存 unit は削除せず**実装回帰テスト**として存置し、挙動の正本は spec + corpus 側に置く（reference.md に優先順を明記）。

### Validation plan（実績）
- `npm run build` / `npm test` exit 0（corpus ランナー含む 197 pass）
- docs-check: spec 内リンク・用語（conformance levels / 8 原則 / Delivery Profile）が requirements Phase 12・ADR-0012 と整合
