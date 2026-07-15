# Issue: CSV パーサーが RFC4180 クォート（カンマ/改行/エスケープ引用符）を未対応だった欠陥の是正

## Meta
- Type: Bug
- Status: Done
- Priority: High
- Completed: 2026-07-15
- Scope: 03_Implement/src/core/workbookLoader.ts, 03_Implement/test/workbookCache.test.ts
- Expected verification level: unit（RFC4180 各挙動）+ 既存全テスト回帰なし

## Traceability
- Related Backlog/Phase: requirements.md Phase 1（CSV/Excel/XML 読み込み）
- Related ADR/Spec: `01_Plans/adr/ADR-0013-phase9-pattern-guide-independent-publication.md` Follow-up Actions
  （「新規発見: `phase9-rule-table-benchmark-pack.csv` の QueryExample 列が CSV クォートされていない」の
  根本原因調査から発見）
- 発見経緯: issue-0105 の検証作業中、Phase 9 CSV 固有の問題と思われていたものが、実は
  **MMI 本体の CSV ローダー `parseCsv()`（`workbookLoader.ts`）が RFC4180 クォートを一切サポートしていない**
  という、製品の中核機能に関わるより広範な欠陥であると判明した。

## 背景（重大度の評価）
`parseCsv()` は素朴な `line.split(',')` であり、CSV セル内のクォート（`"..."`）を一切解釈しない。
これは Phase 9 ベンチマーク資産に限らず、**あらゆる利用者の実データ CSV**（例: `"Smith, John"` のような
カンマを含む氏名、自由記述の Notes 列など、Excel/Google スプレッドシートが標準的にエクスポートする形式）を
`![[...]]` で埋め込んだ際に、列がずれた不正確な表を静的表示してしまうことを意味する。

再現（修正前）:
```
入力: Alice,"Smith, John contact"
旧パーサー出力: ["Alice", "\"Smith", "John contact\""]  ← 3列に破損、生クォート文字が残留
```

これは要件 Phase 1 の CSV 読み込み機能そのものの正しさに関わり、Phase 9 ツール群固有の問題より
影響範囲・深刻度ともに大きい。

## Execution Plan
### Proposed solution（実施済み）
`workbookLoader.ts` の `parseCsv()` を、依存追加なしの状態機械による RFC4180 準拠パーサーへ書き換えた。

- クォートされたセル内のカンマ・改行を区切りとして扱わない。
- `""`（二重引用符）をエスケープされた `"` 一文字として解釈する。
- 非クォートセルは従来どおり `trim()`（後方互換）。クォートセルは内容を検証なしで保持（意図的な前後空白を破壊しない）。
- ファイル全体の先頭/末尾の空行除去（従来の `contents.trim()` 相当）とファイル中間の空行保持は従来動作を維持。
- BOM（U+FEFF）除去は新規追加（副次的改善）。

### Acceptance criteria
- [x] クォート内のカンマが列区切りとして扱われない（`"Smith, John contact"` が 1 フィールドとして保持される）。
- [x] `""` エスケープが正しく `"` 一文字へ変換される。
- [x] クォート内の改行が単一の論理行として扱われる（複数物理行にまたがるセル）。
- [x] 非クォートセルの `trim()` 挙動が維持される。
- [x] 既存の全テスト（224件）が無修正で回帰しない。
- [x] 新規 unit 6 件（基本互換・カンマ内包・エスケープ引用符・埋め込み改行・trim境界・複数カンマ+末尾セル）を追加。

### 未対応（本 issue のスコープ外・別途整理が必要）
- `phase9-rule-table-benchmark-pack.csv`（docs/fixture 両方）自体の `QueryExample` 列は、
  本修正後もなお **CSV クォートされていない**（データそのものの欠陥）。本修正はパーサーの正しさを
  回復したのみで、既存の未クォートデータを遡って修正するものではない。当該データを本番プレビューで
  `![[phase9-rule-table-benchmark-pack.csv...]]` として埋め込むと、引き続き列がずれる
  （`check_phase9_template_sync.py` の `csv.DictReader` および本修正後の `parseCsv()` は両方とも
  RFC4180 準拠のため、同じ理由で同じようにずれる）。データ側の是正は `markdownMatrixPlugin.test.ts` の
  独自パーサー・`check_phase9_template_sync.py`・`generate_phase9_pattern_guide.py` の同時更新を伴うため、
  ADR-0013 が意図的に定めた「安定契約に触れない」制約の範囲外であり、別 issue として扱う。

### Validation plan（実績）
```bash
cd 03_Implement
npm run build   # tsc -p tsconfig.json: エラーなし
npm test        # 224 tests pass, phase9 sync OK, guide-sync OK
```
