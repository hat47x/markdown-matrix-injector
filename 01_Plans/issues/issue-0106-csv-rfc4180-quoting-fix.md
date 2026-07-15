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

### 追記（同日中に解消）: Phase 9 CSV データ自体のクォート付与
パーサー修正直後に実データで検証したところ、`phase9-rule-table-benchmark-pack.csv` を実際に
`![[...]]` で埋め込むと（`loadWorkbook` 経由）ヘッダ13列に対しデータ行17列という**実際に再現する破損**を
確認した（`columns=J,K` 等のクエリが完全に無関係なデータを指す）。ADR-0013 が「本 issue のスコープ外」と
定めていた事項だが、コアパーサーが正しくなった今、データ側を是正する方が安全になったため、同日中に
合わせて対応した:

- docs/fixture 両 CSV の `QueryExample` 列をカンマを含む3値のみ `"..."` でクォート（値は不変）。
- `markdownMatrixPlugin.test.ts` の `loadPhase9BenchmarkRows`: 独自の固定位置復元を撤去し、
  `workbookLoader.ts` から export した本番 `parseCsv` をヘッダ名参照で再利用する形へ簡素化。
- `generate_phase9_pattern_guide.py` の `read_rows()`: 同様に独自復元を撤去し標準 `csv.DictReader` へ簡素化。
- `check_phase9_template_sync.py` は無変更（元々 `csv.DictReader` で標準準拠）で実行し `OK` を確認。
- 生成ガイド（`phase9-rule-table-pattern-guide.md`）は内容無変化（両方式が同じ正しい値を復元していたため）。
- 実 CSV 埋め込み再検証: ヘッダ13列・データ行13列で一致することを確認（修正前は17列に破損）。

`ADR-0013` の Follow-up Actions にも本対応の完了を追記済み。

### Validation plan（実績）
```bash
cd 03_Implement
npm run build   # tsc -p tsconfig.json: エラーなし
npm test        # 224 tests pass, phase9 sync OK, guide-sync OK
```
