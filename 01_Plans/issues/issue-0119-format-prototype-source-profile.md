# Issue: 書式prototypeのsource profile境界と同一adapter生成を固定する

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/experimental/worksheetFormatPrototype.ts`, `03_Implement/test/worksheetFormatPrototype.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: requirements.md Phase 1 / Phase 5 / Phase 11
- Related ADR/Spec: ADR-0017-fly-inspired-format-deviation-assistance.md
- Dependency: issue-0114〜0118 Done

## 背景

issue-0116で、観測側だけが全列などの正しい特徴を持ち、prototype側が識別特徴だけを手書きで持つと、Jaccard分母が非対称になってDeviationScoreを不当に押し上げることを確認した。

さらにSheetJS CEの公開実装・文書を再確認した結果、`cellStyles: true` はstyle metadataを有効化するが、XLSX parserの公開実装系ではセル`.s`へfillを設定する処理が確認できる一方、borderを同じ契約で復元する保証は確認できない。したがって、SheetJS CE由来の観測を「full style観測」として扱ってはならない。

参考は次のとおりです。
- https://docs.sheetjs.com/docs/api/parse-options/
- https://git.sheetjs.com/sheetjs/sheetjs/src/commit/4495a9253e82eb54e5a97b83638974f158fa634c/bits/66_wscommon.js

## Execution Plan
### Proposed solution

runtime prototypeを必ず**観測時と同じfeature adapter**から生成し、さらにprototypeへfeature versionとsource profileを記録する。

source profileは、どの入力経路でどの種類のevidenceを比較契約に含めるかを表す。初期のSheetJS CE 0.20.3 / XLSX profileは保守的に次だけを保証対象とする。

- `structure`: セル文字列、位置、merge、header/layout等
- `fill`: `cellStyles: true`で得られるfill evidence
- `border`: **保証対象外**。bridgeがborder objectを受け取れることと、SheetJS CE XLSX parserがborderを供給することを混同しない。

prototypeと観測でfeature version、source profile ID、evidence contractが一致しない場合、類似度を計算せず明示エラーにする。欠落evidenceをDeviationとして数えるより、比較不能として止める。

さらにsource profileはメタデータだけではなく、実際にmatcherへ渡すfeature集合を制約する。`structure + fill` profileでは、adapterが`border:*`を観測していても比較対象から除外する。full-style profileを明示した場合だけborderを比較する。

### Acceptance criteria
- [x] prototypeは`extractWorksheetFormatFeatures`の完全観測から生成され、手書きfeature抜粋を必要としない。
- [x] prototypeにfeature version、source profile ID、evidence contractを記録する。
- [x] SheetJS CE XLSX 0.20.3 profileは`structure + fill`とし、borderを保証対象に含めない。
- [x] source profileに含まれないfeature namespaceをprototype・観測の双方から対称に除外する。
- [x] 同じprofileから生成したbaselineと観測はmatcherへ渡せる。
- [x] source profileまたはevidence contractが異なるprototypeは比較前に拒否する。
- [x] feature versionが異なるprototypeは比較前に拒否する。
- [x] 空prototype、空profile、空evidence contractをfail-closedにする。
- [x] 既存製品経路へ接続しない。
- [x] ローカルstrict TypeScript検証とunit testが成功する。

### 検証上の注意

小さな表では特徴総数が少なく、fill 1項目の差だけでもJaccard類似度が既定閾値0.7を下回り得ることをローカル試験で確認した。この段階では閾値を緩めない。小規模表用の閾値・重み付けは実fixtureを増やしてから別Issueで設計する。

## Validation evidence

### 2026-09-12 local validation

- 実行環境: Node.js `v22.16.0`, TypeScript `5.8.3`。
- main由来の実際の`flyInspiredFormatMatcher.ts`と`worksheetFormatFeatureAdapter.ts`をローカルへ再現し、新規`worksheetFormatPrototype.ts`と同じ条件で `--strict --target ES2022 --module NodeNext --moduleResolution NodeNext` の型検査・コンパイルを実施して成功。
- 統合unit test: **6 tests / 6 pass / 0 fail**。
- 確認項目は次のとおりです。
  - SheetJS CE XLSX profileで`border:grid`が観測されても比較featureから除外される。
  - full-style profileではborder evidenceを保持できる。
  - 同一profileの基準prototypeに対するdark→gray fill driftは候補として残り、DeviationScoreは0より大きくなる。
  - profile ID、evidence contract、feature versionの不一致は類似度計算前に拒否される。
  - 空profile / 空evidence / 非表形式prototypeはfail-closedになる。

GitHub Actionsは既知のリソース不足のため完了条件から除外した。

## 次段階

実SheetJS 0.20.3 runtimeをこの環境へ取得できないため、実XLSX round-trip自体は引き続き未完了。ただし公開実装のstyle処理から、borderをSheetJS CE XLSX profileの保証対象へ含めない設計根拠は得られた。

次は、repo内XLSXまたは生成fixtureを用いて、`structure + fill`だけで実務上の書式候補識別がどこまで成立するかを評価する。必要ならborderを追加する前に、merge、列ラベル、行列位置、空白パターン等のstyle非依存特徴を増やす。
