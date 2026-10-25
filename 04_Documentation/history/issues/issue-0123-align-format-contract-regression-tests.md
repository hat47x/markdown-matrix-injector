# Issue: 書式feature contract v3への更新に既存回帰テストを追随させる

この文書は当時のIssue記録です。issue-0121のv3契約変更に伴う、既存回帰テストの期待値と名称の修正記録です。既存の記録には実行テスト件数の明記がないため、新たな成功件数や現在のCI合格を補いません。

## Meta
- Type: Test / Maintenance
- Status: Done
- Priority: High
- Scope: `03_Implement/test/worksheetFormatHierarchy.test.ts`
- Expected verification level: unit

## 背景

issue-0121で、相対列位置・headerの連続性・title merge spanを追加し、`WORKSHEET_FORMAT_FEATURE_VERSION`を`worksheet-format-v3`へ更新した。

この変更自体の新規テストはv3を前提としていたが、issue-0120由来の既存`worksheetFormatHierarchy.test.ts`には、feature contractが`worksheet-format-v2`であることを固定確認するテストが残っていた。

GitHub Actionsは既知のリソース不足で利用しない運用のため、局所検証だけではこの種の「別テストファイルに残った旧契約」を見落とす可能性がある。今回の不整合は、実装不具合ではなく**契約version更新時に関連回帰テストを同時に棚卸しする必要性**を示している。

## 変更

- `worksheetFormatHierarchy.test.ts`のversion期待値を`worksheet-format-v3`へ更新する。
- テスト名もv3へ合わせ、何を確認しているかを明確にする。
- matcher閾値、feature内容、production経路は変更しない。

## 参画者向け補足

`WORKSHEET_FORMAT_FEATURE_VERSION`は単なる表示用versionではない。

prototypeは「あるfeature集合の定義」で作られるため、featureの意味や種類が変わったあとに旧prototypeを新しい観測と比較すると、DeviationScoreが意味を失う可能性がある。そのためこのversionは**比較可能性を守る契約番号**として使われ、prototypeと観測のversionが異なる場合はfail-closedで比較を止める。

したがって、feature追加時には次の3点を一組として確認する。

1. adapterが新しいfeatureを出すこと
2. feature contract versionが更新されること
3. 既存のversion gateテストと回帰テストが新契約へ追随すること

## Validation evidence

- 変更対象はversion期待値とテスト名のみ。
- issue-0121の`worksheet-format-v3`契約と整合することを確認。
- 今後のfixture評価はこの回帰修正後のmainを基準とする。

GitHub Actionsは既知のリソース不足のため完了条件から除外する。

## 次段階

実務に近い複数worksheet fixtureを用意し、`structure + fill`と`structure only`の双方でknown / ambiguous / novel境界を評価する。その際、局所テストだけではなく関連するハエ脳書式認識テスト群をまとめてローカル実行する。
