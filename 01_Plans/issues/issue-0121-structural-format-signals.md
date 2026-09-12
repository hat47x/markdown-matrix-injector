# Issue: style非依存の位置・結合構造特徴を追加する

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/experimental/worksheetFormatFeatureAdapter.ts`, `03_Implement/src/experimental/worksheetFormatPrototype.ts`, `03_Implement/test/worksheetFormatStructuralFeatures.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: requirements.md Phase 1 / Phase 5 / Phase 11
- Related ADR/Spec: ADR-0017-fly-inspired-format-deviation-assistance.md
- Dependency: issue-0120 Done

## 背景

issue-0119でSheetJS CE XLSXの比較契約を`structure + fill`へ限定し、issue-0120で小規模表向けに粗い階層特徴を追加した。しかし、style情報が欠けるWorkbookでは列ラベル集合と列数が中心となり、同じラベルを異なる順序で持つ表や、空き列を挟む表、タイトル結合幅が異なる表を十分に区別できない。

とくに`column:<label>`は集合として正規化されるため、列順序を失う。これはExcel設計書の書式認識では重要な構造情報である。一方、絶対列番号を特徴にすると表を右へ移動しただけで別書式と判定してしまうため、位置は表左端からの相対値として扱う。

## Execution Plan

### Proposed solution

既存の意味特徴を残したまま、styleに依存しない構造特徴を重ねる。

- `column-position:<relative-column>:<label>`: 表左端を0とする列ラベル位置。
- `layout:header-contiguous` / `layout:header-gapped`: headerセルが連続列か、空き列を含むか。
- `layout:title-span:<n>`: header列範囲と重なるタイトル行mergeの最大幅。
- 従来の`column:<label>`、`layout:<n>-columns`、`region:title-row`は互換的な粗い特徴として維持する。

特徴契約が変わるため`WORKSHEET_FORMAT_FEATURE_VERSION`を`worksheet-format-v3`へ上げる。v2 prototypeとの混在は既存version gateで拒否する。

### Acceptance criteria
- [x] 同一表を別の絶対列へ平行移動しても同じ相対位置特徴になる。
- [x] 同じ列ラベル集合でも順序が異なればDeviation evidenceが残る。
- [x] 連続headerと空き列を含むheaderをstyleなしで区別できる。
- [x] タイトル結合幅をheader列との重なり幅として保持する。
- [x] feature versionをv3へ上げる。
- [x] source profileでは新特徴を`structure` evidenceとして扱う。
- [x] 既存製品経路へ接続しない。
- [x] ローカルstrict TypeScript検証とunit testが成功する。

## Validation evidence

### 2026-09-12 local validation

- 実行環境: Node.js `v22.16.0`, TypeScript `5.8.3`。
- `flyInspiredFormatMatcher.ts`と更新後の`worksheetFormatFeatureAdapter.ts`を `--strict --target ES2022 --module NodeNext --moduleResolution NodeNext` でコンパイルして成功。
- 構造特徴unit test: **5 tests / 5 pass / 0 fail**。
- 確認項目:
  - C:EとH:Jに同じ3列表を置いた場合、相対位置特徴は一致する。
  - `ID / 項目 / 値`と`ID / 値 / 項目`は異なる`column-position:*`を持つ。
  - 連続3列と空き列を含む3列で`header-contiguous` / `header-gapped`が分かれる。
  - 3列幅タイトルと2列幅タイトルで`layout:title-span:*`が分かれる。
  - 列順変更をmatcherへ渡した場合、DeviationScoreが0より大きい。

GitHub Actionsは既知のリソース不足のため完了条件から除外した。

## 次段階

次は、実務に近い複数のWorkbook書式fixtureを用意し、`structure + fill`、`structure only`の双方でknown / ambiguous / novelの境界を評価する。そこで列位置特徴が強すぎる場合は、閾値を緩めるのではなく特徴階層または重み付けを見直す。
