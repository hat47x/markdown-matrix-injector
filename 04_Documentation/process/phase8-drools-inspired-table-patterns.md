# Phase 8: Drools Excel テンプレート参照の表パターンカタログ

> **本文書の位置付け（ADR-0013）**: 本カタログは **MMI 自身の内部機能**（印刷制御・Smart Fallback・query フィルタ等）
> を題材にした Drools 参照パターンの適用ケーススタディです。汎用的な SIer 設計文書テンプレートではありません。
> ツール非依存で使える汎用パターンをお探しの場合は、
> [`samples/phase9-rule-table-pattern-guide.md`](../samples/phase9-rule-table-pattern-guide.md) を参照してください。

## 目的
システム設計文書で使う表形式について、Droolsのspreadsheet decision tableの構造を参考に、**文書パターン**と**テストデータパターン**を整理します。ここでの適用対象はMMI内部機能を題材にしたケーススタディであり、汎用的な設計書ひな形の採用を示すものではありません。

## 参照元（一次情報）
- Drools Rule Language Reference（Spreadsheet decision tables）  
  https://kie.apache.org/docs/10.0.x/drools/drools/language-reference/index.html

次のDroolsの構造を、表パターンを整理する際の比較軸として使います。
- `RuleSet` 領域（パッケージ全体に効く定義）
- `RuleTable` 領域（行がルール、列が条件/アクション/属性）
- `NAME` による規則名の上書き
- 追加属性（例: `PRIORITY`, `DATE-EFFECTIVE`, `DATE-EXPIRES`）

---

## 1. システム設計文書向けパターン分類

MMI内部機能を文書化する際の観点を、P01〜P08に分けて示します。

| Pattern ID | Drools 参照構造 | 設計文書での用途 | 必須列（最小） | 任意列（拡張） |
|---|---|---|---|---|
| P01 | RuleSet | 文書全体の前提/適用範囲 | `DocScope`, `Owner`, `Version` | `ImportRef`, `GlossaryRef` |
| P02 | RuleTable + CONDITION | 入力条件マトリクス | `ConditionCategory`, `ConditionExpr` | `Source`, `Risk` |
| P03 | RuleTable + ACTION | 出力/処理方針マトリクス | `ActionType`, `ActionExpr` | `FallbackAction` |
| P04 | RuleTable + NAME | 規則・シナリオ命名の明示 | `RuleName` | `Alias`, `TraceID` |
| P05 | Rule attribute: PRIORITY | 優先度の明示 | `Priority` | `EscalationLevel` |
| P06 | Rule attribute: DATE-EFFECTIVE | 適用開始日管理 | `EffectiveFrom` | `ReleaseTag` |
| P07 | Rule attribute: DATE-EXPIRES | 適用終了日管理 | `ExpiresAt` | `SunsetReason` |
| P08 | RuleSet + RuleTable trace | 文書→実装→テストの追跡 | `RelatedRequirement`, `RelatedTest` | `RelatedIssue`, `RelatedADR` |

---

## 2. テストデータ（CSV/XLSX）向けパターン分類

以下は、各パターンに対応する試験データで確認したい観点です。検証が今回実行されたという意味ではありません。

| Test Pattern | 主目的 | 最小列 | 期待する検証観点（MMI） |
|---|---|---|---|
| T01: 条件抽出 | 条件列のフィルタ再現 | `RuleName`, `ConditionExpr`, `Priority` | `grep` と `columns` で対象条件のみ抽出できる |
| T02: 結果抽出 | アクション列の確認 | `RuleName`, `ActionExpr`, `Owner` | 条件と結果の対応が崩れず表示される |
| T03: 時限属性 | 有効/失効日の境界確認 | `RuleName`, `EffectiveFrom`, `ExpiresAt` | 日付列の可読性・監査性を担保できる |
| T04: トレース | 上流/下流リンク確認 | `RuleName`, `RelatedRequirement`, `RelatedTest` | docs audit 時に還流先を即特定できる |
| T05: 運用優先度 | triage 順序の実証 | `RuleName`, `Priority`, `EscalationLevel` | support 対応順序の根拠を説明できる |

---

## 3. MMI での利用方法（実運用）
以下の手順は、本カタログを使って文書・試験データを整理する際の運用ルールです。

1. 文書化時はP01〜P08のどれに該当する表かを宣言してから作表する。
2. 試験データ作成時はT01〜T05を最低1ケースずつ含める。
3. 埋め込み検証は次を標準テンプレートとする。

```md
![[../samples/phase8-drools-inspired-system-design-patterns.csv#Sheet1|A1:J9?header=first&mode=table]]
```

```md
![[../samples/phase8-drools-inspired-system-design-patterns.csv#Sheet1|A1:J9?header=first&columns=A,C,D,F&grep=print&mode=table]]
```

4. 監査で不足パターンが見つかった場合は、次の作業を併せて実施する。
   - 本カタログへパターン追記
   - `03_Implement/test` へ該当観点の検証追加
   - 必要に応じて `requirements` / `issue` へ還流

---

## 4. 具体サンプルデータ
- 文書用サンプル: `04_Documentation/samples/phase8-drools-inspired-system-design-patterns.csv`
- テスト用fixture（同等構造）: `03_Implement/test/fixtures/workspace/data/drools-inspired-system-design-patterns.csv`

この2つの対応を維持し、公開文書で説明するパターンとテストで扱うパターンの乖離を抑えます。
