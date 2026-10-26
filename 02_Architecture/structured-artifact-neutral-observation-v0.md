# Structured Artifact Neutral Observation v0

## 1. Position

本契約は、Issue #218 SAI-0A/H1で研究目的に限って用いる、製品間の観測情報の受け渡し形式である。

MMIのworksheet perception（ワークシートの観測）、review-route（レビュー経路）、reference-expression（参照記法）の各契約を置き換えるものではない。

MMIのruntime/evaluation schema（実行時・評価時の形式）、hat47x.structured-artifact-observation/v0、別製品のruntime schemaは、それぞれ独立したまま扱う。

目的は、独立した製品同士が相手のruntime types（実行時の型）を取り込まずに、比較可能な構造観測を投影できるか検証することである。

## 2. JSON identity

使用するschema（データ形式の識別子）は次のとおり。

~~~text
hat47x.structured-artifact-observation/v0
~~~

外部との受け渡しに用いるJSONでは、言語間で扱いやすいようにsnake_case（単語をアンダースコアで区切る命名）を用いる。

最上位に置く項目は、次のとおり固定する。

- schema
- observation_id
- producer
- source
- region
- features
- labels
- split
- provenance

未知の最上位項目を含む入力はfail closed（推測で受け入れず拒否する）とする。

## 3. Producer and provenance

中立観測（製品固有の形式から投影した観測記録）は、元になった製品固有の観測まで追跡できなければならない。

producer（観測を出力した側）の情報は次のとおり。

- repository
- producer_schema
- producer_version_or_git_sha
- adapter_version

provenance（元の観測と変換処理の来歴）は次のとおり。

- source_observation_ref
- source_observation_digest
- adapter_config_digest

digestの表記には、小文字のsha256:<64 hex>（SHA-256の16進数64桁）を用いる。

adapter（形式を変換する部品）は、観測の意味について新しい判断権限を生み出さない。

## 4. Source

source（観測対象の原本を示す情報）には、次の項目を含める。

- source_digest
- source_format
- source_family_id
- sheet_or_entity_id
- privacy_class
- synthetic

ローカル環境の絶対パスは、中立契約には含めない。

source_format=syntheticの場合は、synthetic=trueが必要である。

## 5. Region

スプレッドシートの座標には、次の規則を用いる。

~~~text
coordinate_system = one_based_inclusive
~~~

行・列のstart、end、countは、すべてnullとするか、すべて値を設定する。

値を設定する場合は、次の関係を満たす。

~~~text
count = end - start + 1
~~~

XMLなど格子状ではない観測では、座標をnullとしてよい。

## 6. Features

v0では、製品に依存しない次のnamespace（特徴の分類名）を認める。

geometry:
- border_closure
- grid_alignment
- merge_ambiguity
- topology_consistency
- non_empty_ratio
- merged_cell_count

pattern:
- repeated_row_signal
- repeated_column_signal

role:
- header_candidate_signal
- body_candidate_signal

各feature（観測から得た特徴）には、次の情報を保持する。

- value
- kind
- method
- confidence

kind（特徴値の種類）はmeasured、derived、categorical、unknownのいずれかとする。

measured/derivedの値は有限の数値とする。true/falseは数値として扱わず、NaNとinfinityは拒否する。

unknownの場合はvalue=nullとする。

featureが存在しないことは値がゼロであることを意味しない。adapterは取得できなかった観測値を補完しない。

MMIのmatched/ambiguous/novelやreview-routeの値を、暗黙にgeometry featureへ変換しない。

## 7. Labels

label（観測に付ける分類ラベル）は任意であり、featureとは分けて保持する。

v0で候補となるlabelは次のとおり。

- region.table_like
- region.header_boundary
- region.repeated_block
- region.hierarchy_relation
- region.ambiguous_or_non_table

各labelには、次の情報を保持する。

- value
- label_source
- labeler_or_rule_version
- blind_to_candidate_model
- confidence

label_source（ラベルの出所）はdeterministic、human_annotation、adjudication、teacher_candidateのいずれかとする。

`label_source`はラベルの出所を記録する項目であり、採用やレビューの状態ではない。human_annotationやadjudicationのラベルは、人が付けたという理由だけで原本の事実にはならない。teacher_candidateも、出力されたという理由だけで採用済みにはならない。製品側のレビュー判断は、この中立観測契約の外で扱う。

human_annotationとadjudicationにはblind_to_candidate_model=trueが必要である。

MMIのreview-route adjudication（レビュー経路での判定）を、構造labelへ自動的に変換しない。

## 8. Split and leakage

split（評価データの分割先）はtrain、valid、test、unassignedのいずれかとする。

group key（同じ出所のデータをまとめるためのキー）は次のとおり。

- source_family
- workbook_or_document
- mutation_family

validator（契約への適合を検査する処理）は、同じgroupがtrain/valid/testをまたぐ場合に拒否する。

これにより、近接するシート、同一原本から作った変種、類似したfixture（検証用データ）の系列が評価用の分割をまたいで混入することを防ぐ。

unassignedは研究用データを一時的に置く状態であり、学習用・評価用の分割が済んだことを意味しない。

## 9. Divergence

同じsourceやregion（観測対象の領域）でも、製品によって異なる観測結果を出す場合がある。

その場合も観測結果は別々に保持し、合成した一行を正解として扱わない。

最初のSAI-0で確認する成功条件は、両製品の観測結果が一致することではない。確認するのは次の点である。

独立した二つの製品が、それぞれの元の観測への追跡可能性を保ち、validatorに適合する中立観測を出力できること。

## 10. Canonical serialization

検証後、objectのkeyを再帰的に並べ替え、JSONにLF（改行）を付けた形式で直列化する。

研究用artifact（成果物）の同一性には、そのcanonical bytes（規則に従って直列化したバイト列）のSHA-256を利用できる。

この値はsource_digestや製品のruntime identityを置き換えるものではない。

## 11. Non-goals

v0では、次の事項を対象に含めない。

- model training
- MMI runtime schema changes
- worksheet matcher tuning
- review-route changes
- automatic source writes
- cross-product ground-truth merging
- common scoring of product-specific confidence
- creation of a standalone research repository

## 12. Next step

SAI-0B/H1では、excel-houganshi-normalizer #20が同じJSON契約に従う出力を独立に生成することを求める。

二つの製品で契約を再利用できたことを確認してから、rules、logistic regression、LightGBMによる比較に進む。

## 13. Before v1: convergence check with SEI contracts (informative)

本節は参考情報であり、v0の規則を変更せず、SEIへの依存も追加しない。

hat47x.structured-artifact-observation/v0をv1へ進める前に、hat47x/sei-cognitionの次の契約（いずれもSEIのmainのcontracts/にあるv1alpha1）と整合できるか確認する。

- sei.semantic-interchange/v1alpha1: a thin portable envelope. A receiver must not interpret an unknown contract id or version as known. SEI fixtures keep such records opaque as not_verified, and partial knowledge is not treated as malformed.
- sei.capability-observation/v1alpha1: provider-specific context stays behind references or extensions. Trust and priority are not inferred from the provider kind.
- sei.jcs+sha256/v1alpha1 and sei.raw-bytes+sha256/v1alpha1: representation profiles used by SEI exact bindings.

v1へ進む前に解消するか、差分として記録する事項は次のとおり。

1. Unknown content. v0 fails closed on unknown top-level fields. The SEI envelope carries unknown nested contracts opaquely as not_verified. These can coexist: fail closed inside a known schema version, and carry unknown versions opaquely at the envelope level. v1 should state which applies where.
2. Canonical bytes. §10 sorts object keys recursively, serializes compact JSON, and appends LF. v0 does not declare RFC 8785 (JCS). The SEI JCS profile follows RFC 8785 and has no trailing newline. Both use SHA-256, but the same object yields different digests, at least because of the trailing LF. v1 should either adopt the JCS profile or declare its own representation profile identity.
3. Digest text. Both sides use sha256:<64 lowercase hex>. MMI source identity (source-identity-contract-v1.md, representation source-file-bytes-v1) follows the same byte rule as sei.raw-bytes+sha256/v1alpha1.
4. Provenance. v0 producer and provenance fields (§3) should map onto SEI adapter and mapping provenance without flattening source origin, derivation, and adapter version into one field.
5. Confidence. The v0 non-goal "common scoring of product-specific confidence" (§11) agrees with ADR-0018 D4 and with SEI provider neutrality. v1 should keep it.

目的は、関連製品群に三つ目の独立したenvelope（データの受け渡しを包む形式）を増やさないことである。候補は、(a) v0/v1をSEI interchange envelopeの拡張記録として運べるpayload契約にする、(b) v1のcanonicalizationをJCS profileに合わせる、(c) 両者を分けたまま対応表を公開する、の三つである。選択はv1への移行時に行い、二つ目のproducer（excel-houganshi-normalizer）の合意を要する。

依存関係は追加しない。MMIのvalidators、adapters、testsはSEIのコードやschemaを取り込まない。確認は文書同士の比較と、必要に応じたfixture単位のdigest比較で行う。

証拠は設計上の検討に限られる。製品間の実行検証はまだ行っていない。

関連資料は[SEI decision-semantics mapping](sei-decision-semantics-mapping.md)（日本語）と[issue-0192](https://github.com/hat47x/markdown-matrix-injector/issues/498)を参照。
