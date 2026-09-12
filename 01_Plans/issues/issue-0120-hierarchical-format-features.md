# Issue: 小規模表に耐える階層的な書式特徴表現

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/experimental/worksheetFormatFeatureAdapter.ts`, `03_Implement/src/experimental/worksheetFormatPrototype.ts`, `03_Implement/test/worksheetFormatHierarchy.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: requirements.md Phase 1 / Phase 5 / Phase 11
- Related ADR/Spec: ADR-0017-fly-inspired-format-deviation-assistance.md
- Dependency: issue-0119 Done

## 背景

source profile境界を固定した後、2〜6列表で軽微な差異をローカル評価した。feature v1では3列以上の表はfill tone変更・fill欠落・列名1件変更を候補として保持できる一方、2列表だけはdark→grayや列名1件変更で既定confidence 0.7を下回り`novel`となった。

これは閾値より、特徴数が少ない小規模表で具体特徴1件の置換がJaccard集合へ与える影響が大きいことが原因である。閾値を緩めると別書式の誤採用も増えるため、先に特徴表現を階層化した。

## Execution Plan
### Proposed solution

具体特徴だけでなく、同じ観測を複数解像度で表す粗い共有特徴を追加する。

- `region:table`: header候補を持つ表領域であること
- `header:row`: header行が成立したこと
- `header:fill-present`: dark / gray / lightのいずれかのfill evidenceが存在すること
- 既存の`header:<tone>-fill`: fill toneの細粒度特徴として維持
- 既存の`column:*`, `layout:*`, `region:title-row`, `border:*`も維持

これによりdark→grayでは`header:fill-present`を共有し、fill欠落時も`region:table` / `header:row`が共通のアンカーとして残る。FlyHash風疎表現に、粗いカテゴリと細かい特徴を重ねて入力する形である。

feature集合が変わるため、`WORKSHEET_FORMAT_FEATURE_VERSION`を`worksheet-format-v2`へ上げた。v1 prototypeとの比較はissue-0119のversion gateにより自動的に拒否される。

source profileのevidence filterも更新し、`header:fill-present`を`fill` evidenceとして扱う。`structure` profileへ誤って混入させない。

### Acceptance criteria
- [x] header候補が成立した観測に`region:table`と`header:row`を追加する。
- [x] meaningful fillがある場合に`header:fill-present`と具体toneの両方を追加する。
- [x] SheetJS CE XLSX profileで`header:fill-present`はfill evidenceとして扱う。
- [x] feature versionをv2へ上げ、v1 prototypeとの混在を拒否できる。
- [x] 2列表のdark→gray、fill欠落、列名1件変更はいずれも既定閾値のまま候補として残る。
- [x] 同じ外観・同じ2列幅でも列名が両方異なる別表は`novel`のまま維持する。
- [x] 競合する2つの2列prototypeに等距離の観測は`ambiguous`となりwinnerを返さない。
- [x] 既存製品経路へ接続しない。
- [x] ローカルstrict TypeScript検証とunit testが成功する。

## Validation evidence

### 2026-09-12 local validation

- 実行環境: Node.js `v22.16.0`, TypeScript `5.8.3`。
- main由来の実際の`flyInspiredFormatMatcher.ts`、`worksheetFormatFeatureAdapter.ts`、`worksheetFormatPrototype.ts`と新規hierarchy testを `--strict --target ES2022 --module NodeNext --moduleResolution NodeNext` でコンパイルし成功。
- issue-0119のsource-profile回帰testと新規hierarchy testを同時に実行し、**13 tests / 13 pass / 0 fail**。
- matcher既定値 `minConfidence=0.7` / `minWinnerMargin=0.05` は変更していない。

### 2列表の境界値

基準: titleあり、header `項目 / 値`、dark fill、SheetJS CE XLSX profile (`structure + fill`)。

| 観測差分 | status | confidence | DeviationScore |
|---|---|---:|---:|
| dark → gray | matched | 0.777778 | 0.222222 |
| fill欠落 | matched | 0.750000 | 0.250000 |
| `値` → `内容` | matched | 0.777778 | 0.222222 |
| `項目 / 値` → `コード / 名称` | novel | 0.600000 | 0.400000 |

さらに `項目 / 値` と `項目 / 説明` の2 prototypeに対し `項目 / 内容` を観測させると、双方confidence `0.777778`で`ambiguous`となりwinnerを返さないことを確認した。

この結果から、閾値緩和ではなく階層特徴によって「軽微差を候補として残す」「別表や拮抗候補を自動採用しない」を両立できる見込みを得た。

## 次段階

階層特徴は小規模表の過敏性を改善したが、まだ表全体の空白パターン、merge構造、ラベル位置関係などを十分に使っていない。次は実Workbookに近い複数書式fixtureを増やし、style情報が薄い場合にもstructureだけで識別できる特徴を評価する。実SheetJS 0.20.3 runtime round-tripが可能な環境を得た場合は同じfixtureをそのまま再利用する。
