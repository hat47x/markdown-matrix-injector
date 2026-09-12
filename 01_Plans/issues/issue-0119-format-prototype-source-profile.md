# Issue: 書式prototypeのsource profile境界と同一adapter生成を固定する

## Meta
- Type: Feature
- Status: In Progress
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

参考:
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

### Acceptance criteria
- [ ] prototypeは`extractWorksheetFormatFeatures`の完全観測から生成され、手書きfeature抜粋を必要としない。
- [ ] prototypeにfeature version、source profile ID、evidence contractを記録する。
- [ ] SheetJS CE XLSX 0.20.3 profileは`structure + fill`とし、borderを保証対象に含めない。
- [ ] 同じprofileから生成したbaselineと観測はmatcherへ渡せる。
- [ ] source profileまたはevidence contractが異なるprototypeは比較前に拒否する。
- [ ] feature versionが異なるprototypeは比較前に拒否する。
- [ ] 空prototype、空profile、空evidence contractをfail-closedにする。
- [ ] 既存製品経路へ接続しない。
- [ ] ローカルstrict TypeScript検証とunit testが成功する。

### 検証上の注意

小さな表では特徴総数が少なく、fill 1項目の差だけでもJaccard類似度が既定閾値0.7を下回り得ることをローカル試験で確認した。この段階では閾値を緩めない。小規模表用の閾値・重み付けは実fixtureを増やしてから別Issueで設計する。

### Validation plan

GitHub Actionsはリソース不足のため完了条件に含めない。新規source-profile層をstrict TypeScript条件でコンパイルし、同一profile比較・profile不一致・version不一致・fail-closedをunit testする。
