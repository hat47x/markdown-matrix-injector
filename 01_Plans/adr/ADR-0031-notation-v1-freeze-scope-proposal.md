# ADR-0031: MMI Notation v1.0.0で凍結する範囲（提案）

- Status: Proposed
- Date: 2026-10-21
- Deciders: MMI Lead Agent（提案。凍結の最終承認はHuman Sponsor）
- Scope: `04_Documentation/spec/mmi-notation-v1.md`、`params.schema.json`、conformance corpus、初回公開の互換性約束
- Related: [ADR-0012](ADR-0012-mission-redefinition-notation-as-governance-boundary.md)、[ADR-0022](ADR-0022-semantic-selection-in-notation.md)、[ADR-0030](ADR-0030-boundary-diagnostic-before-existence.md)、Issue #528

## Context

仕様は`1.0.0-draft.1`で、v1.0.0到達時にコア構文を凍結すると定めている。初回公開後に構文やパラメータの意味を変えると、利用者の文書が壊れる。一方、実験キー（`x-headers`、`x-below`、`x-table`、`x-name`）は参照実装で使われているが、規範にするには実運用の証拠が足りない。`where=`はADR-0022で保留のままだ。

凍結範囲を決めずに公開すると、次のどちらかになる。

1. 実験キーまで凍結し、後から意味を直せなくなる。
2. 何も凍結せず、初回公開後も破壊的変更を許してしまう。

また、仕様の規範文とconformance corpus（現在22ケース）の対応が暗黙で、どの規範が試験で固定されているか分かりにくい。

## Decision

v1.0.0で凍結する範囲を、次のとおり**提案**する。Human Sponsorの承認後に`Status: Accepted`とし、仕様の版を`1.0.0`へ上げる。

1. **コアとして凍結する。** P1〜P8、§3の構文とパース規則、§4の解決モデル、§6の変換パイプラインの順序と5ステップ、§9の診断コード（`MMI_FILE_NOT_FOUND`・`MMI_SHEET_NOT_FOUND`・`MMI_INVALID_XML`・`MMI_PATH_OUTSIDE_BOUNDARY`）、§8のL0〜L2を凍結する。
2. **コアパラメータの意味を凍結する。** `params.schema.json`の12キー（`mode`・`header`・`columns`・`transpose`・`grep`・`highlightColumn`・`highlightValue`・`formatColumn`・`caption`・`id`・`pageBreak`・`orientation`）の名前と意味を凍結する。追加はminor、既存の意味変更はmajorとする。
3. **L3 Delivery Profileを凍結する。** `caption`・`id`・`pageBreak`・`orientation`の意味、別紙マニフェストの列（`sourcePath,sheet,range,reason,caption,id`）、参照実装のHTML契約（`mmi-embed`/`mmi-table`/`mmi-card`/`mmi-error`と`data-*`属性）を1.xの契約とする。HTMLの見た目は実装ごとに自由とする。
4. **実験キーは`x-`のまま残す。** `x-headers`・`x-below`・`x-table`・`x-name`はv1.0.0のコアに昇格しない。P5に従い、未知の`x-`キーは無視でき、無視しても表示は変わらない。`where=`は予約のままで、コアに含めない。
5. **未知キーの扱いを変えない。** `additionalProperties: true`とP5を維持し、将来の追加パラメータを古い処理系が拒否しない。
6. **規範文と試験の対応を公開する。** `v1.0.0-freeze-scope.md`の対応表で、各規範文に対応するconformance caseを示す。対応のない規範は「未固定」と明記し、v1.0.0前に追加するか、規範から外すかを決める。
7. **凍結後の変更ルール。** コア構文・コアパラメータの意味・診断コードの意味の変更はmajor（v2）。追加パラメータ・新しい`x-`キー・新しい診断コードはminor。文言・例・参考訳の修正はpatch。

## Consequences

- **Good:** 初回公開後に壊してはいけない範囲が明示され、利用者と他処理系が安心して実装できる。実験キーをコアに固定しないため、実運用の学びを`x-`のまま反映できる。conformance corpusが凍結範囲の証拠になる。`where=`を未完成のまま凍結しない。
- **Bad:** v1.0.0のコアは、`x-`キーを使う参照実装の一部機能を含まない。実験キーの昇格はmajor/minorの判断が必要になる。L3のHTML契約を凍結すると、参照実装のクラス名変更が難しくなる。対応表に未固定の規範が残る場合は、凍結前に試験追加か規範削除の作業が要る。
- **Traceability:** 仕様は`04_Documentation/spec/mmi-notation-v1.md` §13、対応表は`04_Documentation/spec/v1.0.0-freeze-scope.md`、conformance corpusは`03_Implement/test/conformance/cases.json`。

## Traceability

- Related Issues: [#528](https://github.com/hat47x/markdown-matrix-injector/issues/528)、[#521](https://github.com/hat47x/markdown-matrix-injector/issues/521)
- Related Docs: [MMI Notation v1](../../04_Documentation/spec/mmi-notation-v1.md)、[凍結範囲の対応表](../../04_Documentation/spec/v1.0.0-freeze-scope.md)
