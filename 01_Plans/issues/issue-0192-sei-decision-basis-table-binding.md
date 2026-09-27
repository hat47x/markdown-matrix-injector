# Issue: 外部の判断記録が表の範囲を根拠として固定できるようにする（SEIを経路Aの利用者に加える）

## Meta
- Type: Docs
- Status: Draft
- Priority: Low
- Scope: ADR-0019（D3・未解決事項）、記法仕様の非規範の付録、02_Architecture（SEIとの対応、構造化資料の観測契約§13）
- Expected verification level: docs-check

## Traceability
- Related ADR/Spec: ADR-0019-ai-era-sier-document-value-and-policy.md, ADR-0018-cognitive-assistance-plane.md, 04_Documentation/spec/mmi-notation-v1.md
- Related design: [Source Identity Contract v1](../../02_Architecture/source-identity-contract-v1.md)、[SEIの判断の意味論との対応](../../02_Architecture/sei-decision-semantics-mapping.md)、[Structured Artifact Neutral Observation v0](../../02_Architecture/structured-artifact-neutral-observation-v0.md)
- Cross-repo（参考。依存ではない）: `hat47x/sei-cognition:contracts/`の`sei.semantic-reference`・`sei.decision-memory`・`sei.capability-observation`・`sei.semantic-interchange`と、Representation Profile `sei.raw-bytes+sha256`・`sei.jcs+sha256`（いずれもSEIの`main`にあるv1alpha1）。家族の対応表`product/definition/SEI_FAMILY_SEMANTIC_MAP.md`とSEIのADR-0032（`plan/adr/ADR-0032-family-integration-apex-and-control-meaning-boundary.md`）は、SEIの未マージのブランチ`docs/family-apex-backflow-20260927`でだけ提案されている
- Dependency: ADR-0019の採否、経路AのCLIの設計

## 背景

ADR-0019は、AIエージェント向けの経路A（CLIの`inspect`・`check`・`render`・`manifest`）を優先度1に置いている。この経路の利用者は、文書を書くAIエージェントだけではない。判断を記録するシステムが、判断の根拠にした表の範囲を引用するときにも使える。本Issueでは、その一例として兄弟製品SEIを経路Aの利用者に加える。

想定する使い方は次のとおりである。SEIの側（または利用者のAIエージェント）が`check`で参照を検証し、`render`で論理表を読んで根拠を確かめ、判断の記録には参照文字列と正本のSource Identity v1だけを残す。CLIはまだないため、これは経路Aの設計への入力にとどまる。

SEIは、人とAIと組織の判断と、その根拠を記録する。SEIでは、家族の各製品がそれぞれ実装した「提案と決定の分離」を、統合せずに翻訳する対応表が提案されている。MMIの行は次のとおりである。

| MMIの記録 | SEIでの読み |
| --- | --- |
| ADR-0018のAuthority PlaneとCognitive Assistance Plane | AuthorityとRecommendation |
| 参照と正本の同一性（Source Identity v1） | Artifact ReferenceとExact Artifact Binding |
| 構造化資料の観測契約 | Observation |

どの行でも、表の正本は元のファイルにあり、SEIの読みがそれを置き換えることはない。

たとえば、組織が過去の判断を振り返るとき、当時の数表を正本のまま根拠として示せれば、後知恵が混ざりにくくなる。これは仮説であり、効果はまだ確かめていない。

確かめた事実は次のとおり。

- 現行の別紙マニフェスト（記法仕様§8.1）の列は`sourcePath,sheet,range,reason,caption,id`で、出所のdigestを含まない。
- MMIのSource Identity Contract v1（`source-file-bytes-v1`）は、正本ファイルのバイト列全体をSHA-256にかけ、`sha256:`に続く小文字16進64桁で表す。SEIの`sei.raw-bytes+sha256/v1alpha1`も同じ規則と表記を使う。
- 構造化資料の観測契約v0は、キーの再帰的な整列、JSONへの直列化、末尾のLFで正準化する。RFC 8785（JCS）への準拠は宣言していない。

## この変更で起案したもの（未マージ）

| 番号 | 内容 | 反映先 |
| --- | --- | --- |
| MMI-1 | 利用者に「判断を記録する人・組織」を加え、判断の記録は記録する側が持つと明記。未解決事項のダイジェストの対象に、外部の判断記録からの固定も同じ問いであると追記 | [ADR-0019](../adr/ADR-0019-ai-era-sier-document-value-and-policy.md) D3・未解決事項 |
| MMI-2 | 参照・内容の同一性・算出方式・解釈の条件を組にして根拠を固定する使い方。新しいパラメータを定めず、P5を変えない | [記法仕様](../../04_Documentation/spec/mmi-notation-v1.md)の付録（非規範） |
| MMI-3 | ADR-0018の2つの面とSEIのAuthority・Recommendation、providerのconfidenceとCapability Observationの対応。ADR-0018はAcceptedのため書き換えない | [SEIの判断の意味論との対応](../../02_Architecture/sei-decision-semantics-mapping.md)（新規） |
| MMI-4 | v1へ上げる前に、SEIのsemantic-interchange・capability-observationとの収束を確かめる項目。家族の中に3つ目の独自の外殻を作らない | [Structured Artifact Neutral Observation v0](../../02_Architecture/structured-artifact-neutral-observation-v0.md) §13 |
| MMI-5 | 本Issue | ― |

## 非目標

- 表の編集、数式の再計算、業務ルールの実行。
- 判断の記録をMMIが持つこと。MMIが渡すのは参照と正本の同一性までとする。
- SEIへの依存。MMIのコード、テスト、配布物はSEIの型やスキーマを読み込まず、SEIを呼び出さない。
- 記法への新しいパラメータの追加、MMI Notation v1の準拠条件の変更。
- コアでのネットワーク取得、ワークスペース境界の外の参照。
- ADR-0018の書き換え。

## Acceptance criteria

- [ ] 経路AのCLIを設計するとき、`check`または`manifest`のJSON出力に、解決した正本ごとのSource Identity v1を含めるかを決め、ADR-0019またはCLIのIssueに記録する。
- [ ] 確定版のダイジェストの対象（ファイル全体か、参照した範囲か）を決めるとき、外部の判断記録から固定する場合の読み方（不一致は「確かめられない」であり「範囲が変わった」ではない）も合わせて決める。
- [ ] 実務サンプルの表を1つ選び、参照文字列、Source Identity v1、記法の版を組にした判断記録の例を作る。正本を変えない場合は「一致」、正本を変えた場合は「不一致」、正本を移した場合は「確かめられない」になることを、MMIの既存の手段だけで確かめる。
- [ ] 構造化資料の観測契約をv1へ上げる前に、§13の5項目の扱いを決めて記録する。

## Validation plan

この変更はdocs-checkだけで確かめる。リンク先の存在、MMIの記法仕様・ADR-0018・Source Identity Contract v1との整合、SEIの`main`にある契約の記述との一致を目で確かめる。

実行の確認（CLIでの出力、判断記録の例での3つの結果）は、CLIを実装した後に行う。SEI側での受け取りの確認はSEIのリポジトリで行い、MMIのテストには含めない。

## Remaining work

- ADR-0019の採否を待つ。採用されない場合、MMI-1の追記はADR-0019とともに見直す。
- SEI側の対応表とADR-0032がマージされたら、本Issueと[SEIの判断の意味論との対応](../../02_Architecture/sei-decision-semantics-mapping.md)にある「未マージ」の注記を更新する。
- 証拠は設計の段階にとどまる。実行、運用、利用者による価値確認の証拠はない。
