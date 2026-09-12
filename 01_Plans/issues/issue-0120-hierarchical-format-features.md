# Issue: 小規模表に耐える階層的な書式特徴表現

## Meta
- Type: Feature
- Status: In Progress
- Priority: Medium
- Scope: `03_Implement/src/experimental/worksheetFormatFeatureAdapter.ts`, `03_Implement/src/experimental/worksheetFormatPrototype.ts`, `03_Implement/test/worksheetFormatHierarchy.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: requirements.md Phase 1 / Phase 5 / Phase 11
- Related ADR/Spec: ADR-0017-fly-inspired-format-deviation-assistance.md
- Dependency: issue-0119 Done

## 背景

source profile境界を固定した後、2〜6列表で軽微な差異をローカル評価した。現行feature v1では3列以上の表はfill tone変更・fill欠落・列名1件変更を候補として保持できる一方、2列表だけはdark→grayや列名1件変更で既定confidence 0.7を下回り`novel`となった。

これは閾値より、特徴数が少ない小規模表で具体特徴1件の置換がJaccard集合へ与える影響が大きいことが原因である。閾値を緩めると別書式の誤採用も増えるため、先に特徴表現を階層化する。

## Execution Plan
### Proposed solution

具体特徴だけでなく、同じ観測を複数解像度で表す粗い共有特徴を追加する。

- `region:table`: header候補を持つ表領域であること
- `header:row`: header行が成立したこと
- `header:fill-present`: dark / gray / lightのいずれかのfill evidenceが存在すること
- 既存の`header:<tone>-fill`: fill toneの細粒度特徴として維持
- 既存の`column:*`, `layout:*`, `region:title-row`, `border:*`も維持

これによりdark→grayでは`header:fill-present`を共有し、fill欠落時も`region:table` / `header:row`が共通のアンカーとして残る。FlyHash風疎表現に、粗いカテゴリと細かい特徴を重ねて入力する形である。

feature集合が変わるため、`WORKSHEET_FORMAT_FEATURE_VERSION`を`worksheet-format-v2`へ上げる。v1 prototypeとの比較はissue-0119のversion gateにより自動的に拒否される。

source profileのevidence filterも更新し、`header:fill-present`を`fill` evidenceとして扱う。`structure` profileへ誤って混入させない。

### Acceptance criteria
- [ ] header候補が成立した観測に`region:table`と`header:row`を追加する。
- [ ] meaningful fillがある場合に`header:fill-present`と具体toneの両方を追加する。
- [ ] SheetJS CE XLSX profileで`header:fill-present`はfill evidenceとして扱う。
- [ ] feature versionをv2へ上げ、v1 prototypeとの混在を拒否できる。
- [ ] 2列表のdark→gray、fill欠落、列名1件変更はいずれも既定閾値のまま候補として残る。
- [ ] 同じ外観・同じ2列幅でも列名が両方異なる別表は`novel`のまま維持する。
- [ ] 競合する2つの2列prototypeに等距離の観測は`ambiguous`となりwinnerを返さない。
- [ ] 既存製品経路へ接続しない。
- [ ] ローカルstrict TypeScript検証とunit testが成功する。

### Validation plan

GitHub Actionsは既知のリソース不足のため完了条件に含めない。実際のmatcher・adapter・prototype層を用いて2列表を中心とした境界ケースをローカル実行する。
