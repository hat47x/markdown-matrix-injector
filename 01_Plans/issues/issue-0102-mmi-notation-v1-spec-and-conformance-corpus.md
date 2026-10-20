# Issue: MMI Notation v1の仕様書と適合性テスト集の整備

この文書は当時のIssue記録です。仕様書1.0.0-draft.1、適合性テスト19件、197件のテスト成功は原記録の数値を保持します。現在の仕様・実装の一致を新たに確認したものではありません。

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: 04_Documentation/spec/mmi-notation-v1.md (新規), 04_Documentation/spec/params.schema.json (新規), 03_Implement/test/conformance/** (新規)
- Expected verification level: unit (corpusを参照実装で全件実行) + docs-check

## Traceability
- Related Backlog/Phase: ADR-0012 D2/D3/D4（conformance levels・8規範原則・エコシステム互換）/ requirements Phase 12（issue-0101で定義）
- Related ADR/Spec: `01_Plans/adr/ADR-0012-mission-redefinition-notation-as-governance-boundary.md`
- Depends on: issue-0101（上流の使命文が確定してから公開仕様を書く）

## 背景
ADR-0012は記法を一級の公開仕様として独立させることを決定した。仕様が「広く受け入れられる」ための要件は
議事録のステークホルダー要求に集約されている: 段階的準拠（L0–L3）、可視な劣化、決定論、封じ込め、前方互換、
安定診断コード、i18n中立（Delivery Profile分離）、機械可読契約（Schema + corpus）。

## 当時の実行計画
### 解決方針（当時の提案）
1. `04_Documentation/spec/mmi-notation-v1.md` を起草（日英併記、RFC 2119語彙）:
   - 構文（ABNF相当）、target/sheet/range/paramsの解決規則
   - Conformance levels L0–L3と各レベルのMUST/SHOULD一覧
   - **Degradation classes**: CommonMark素通し時・Obsidian上・Markdownテーブル内 `|` 衝突時の期待劣化とescaping規則
   - セキュリティ境界（read-only / containment / no-network-in-core）、リモートソース拡張のopt-in規約
   - 診断コード一覧（安定API）、`x-` 実験名前空間、SemVerポリシー
2. `params.schema.json`: 全クエリパラメータのJSON Schema（agent教示・実装検証用）。
3. `03_Implement/test/conformance/`: corpus骨格（`case-*.md` 入力 + 期待論理表/期待診断の宣言）。参照実装のテストランナーで全件実行し、
   corpusと実装の一致をCIで担保（Phase 9の資産化方針を継承）。
4. 既存unit（176件）から仕様例に昇格できるケースをcorpusへ移植し、二重管理を避ける参照構造にする。

### 受入条件（Acceptance criteria）
- [x] 仕様書 `04_Documentation/spec/mmi-notation-v1.md`（1.0.0-draft.1）がL0–L3・8規範原則（P1–P8）・劣化クラス（D0–D2）・診断コード（§9安定API）をRFC 2119語彙で規定。パイプライン順序（slice→columns→transpose→header→grep）を実装事実どおり規範化し、テーブル内 `|` 非対応等の構文制約も §3.2で正直に明記。
- [x] `params.schema.json` が実装12パラメータを全網羅。カバレッジ固定unit（`conformance.test.ts`: schema ⊇ `AUTOCOMPLETE_QUERY_PARAM_CANDIDATES`、`additionalProperties: true` をP5として固定）を追加。
- [x] conformance corpus 19ケース（core 4 / L1 4 / L2 9 / L3 2）: 正常系（header/range/columns/grep/transpose/highlight/format）、劣化系（未知キー無視・`x-` 名前空間・不正pageBreak/orientationの安全劣化）、境界系（grep 0件・列11・セル520 fallback・シート未指定）、エラー可視性（file/sheet/generic-xml）、block描画（no-`<p>`-wrap）。
- [x] 参照実装がcorpus全19件pass（`npm test` へ自動組込・**197 pass / 0 fail**、初回から全緑＝仕様と実装の無乖離を確認）。
- [x] 別紙・納品・改ページ・向きは §8.1 Delivery Profileに隔離（core章に出現しない）。
- [x] 導線整備: README「なぜ規約なのか」からspec/schema/corpus/ADR-0012へリンク、reference.mdが仕様書を挙動記述の正本と宣言。

### 既存 unit との関係（二重管理の回避方針）
既存unitのうち仕様例に値する挙動（transpose+header数値、columns+grep、fallback閾値等）はcorpus側へ**規範例として再宣言**した。
既存unitは削除せず**実装回帰テスト**として存置し、挙動の正本はspec + corpus側に置く（reference.mdに優先順を明記）。

### 当時の検証計画（Validation plan）（実績）
- `npm run build` / `npm test` exit 0（corpusランナー含む197 pass）
- docs-check: spec内リンク・用語（conformance levels / 8原則 / Delivery Profile）がrequirements Phase 12・ADR-0012と整合
