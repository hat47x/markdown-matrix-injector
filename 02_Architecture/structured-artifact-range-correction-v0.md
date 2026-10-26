# 構造候補の範囲修正コスト v0

Status: research-only

## 目的

SAI-2までの評価では、提案した候補が正解範囲と一致したか、曖昧な場合にabstain（候補の確定を控えること）できたかを主に測っている。

しかし、それだけではSIerの実作業に関わる次の問いに答えられない。

> 候補が完全一致しなかったとき、人はどれだけ直せば正しい参照にできるか。

そこで、表候補の位置と大きさという幾何情報だけから計算できる、製品価値評価用の小さな共通契約を設ける。

この契約はruntime（実行時）の判断には用いない。既存のSAI-2 final holdout（最終評価用データ）も再評価しない。

## 測るもの

正解範囲と提案範囲は、いずれもone-based inclusive rectangle（行・列を1から数え、端のセルも含む長方形）として比較する。

評価単位は`source_family_id`と`source_digest`に結び付ける。別のsource（原本）やversion（版）に属する範囲は、座標が偶然同じでも比較対象にしない。digest（原本の同一性を照合する値）は、既存の構造観測と同じ`sha256:<64 lowercase hex>`形式とする。

- `boundary_edit_distance`: 上・左・下・右の4境界について、正解まで動かすセル数の合計。
- `boundary_adjustment_count`: 変更が必要な境界数。0〜4。
- `over_selected_cell_count`: 正解外なのに候補へ含めたセル数。
- `under_selected_cell_count`: 正解なのに候補から漏れたセル数。
- `symmetric_difference_cell_count`: 上記2件の合計。
- `target_coverage`: 正解セルのうち候補が含んだ割合。
- `context_precision`: 候補セルのうち正解に属する割合。
- `context_expansion_ratio`: 候補セル数 / 正解セル数。
- `intersection_over_union`: 従来の幾何的一致度。

これにより、同じIoU（範囲の重なり具合）であっても、「周辺の不要な表を多く含めた」場合と「必要な行を取りこぼした」場合を区別できる。

## 測らないもの

`boundary_edit_distance`は境界の移動量を表す指標であり、人が実際に行った操作回数ではない。

range picker（範囲選択UI）では、1回の操作で複数の境界を修正できる場合もある。このため、v0では次の値を明示して返す。

- `geometric_proxy_only = true`
- `actual_review_actions_measured = false`
- `elapsed_time_measured = false`

実際のreview action（確認・修正の操作）数や所要時間を測定するまでは、「作業時間を何%削減した」という効果は主張しない。

## abstain

abstain（候補を提示しない結果）を、修正距離0として扱わない。

候補を提示しなかった場合、boundary distance、context量、IoUなどは`null`とする。集計時にもproposal（提案ありの結果）の平均から除外し、`abstained_count`を別に示す。

これにより、常にabstainする方式が、見かけ上「誤差0」と評価されることを防ぐ。

## AIへ渡す文脈との関係

`context_expansion_ratio`と`over_selected_cell_count`は、候補範囲をそのままAIへ渡す場合に増え得る文脈量を、セル数で近似するproxy（代理指標）である。

byte数やtoken数を直接測った値ではない。実データを用いる次段階では、privacy boundary（情報の取り扱いに関する境界）を守り、選択されたmaterialized context（実際に取り出した文脈）のbytes/tokensを別に測定する。

v0の計算にはraw cell textを使わない。

## 研究上の境界

SAI-2A final holdoutは、すでに開封され、評価を終えている。今回の指標を後から同holdoutに適用しても、当初の成功条件が増えたことにはしない。

次の製品価値実験では、評価を始める前に独立したfixture（検証用データ）群を用意し、次の事項を事前登録する。

1. 比較する候補生成・ranking方式。
2. clear target / abstain target。
3. correction metricの優先順位。
4. 許容するabstention。
5. 実際のreview action / elapsed timeを測るか。
6. materialized context bytes/tokensを測るか。
7. 評価後にthresholdやtargetを変更しないこと。

## 製品価値との接続

MMIの製品価値は、表分類器の精度だけでは測れない。

利用者がExcel等の原本を書き換えずに、次を実現できることが重要である。

- 欲しい範囲へ短く到達できる。
- 余計な範囲をAIへ渡しにくい。
- 足りない範囲を見落としにくい。
- 曖昧なら自動確定せず、明示指定へ戻れる。

この契約は、上記のうち最初の三点を幾何的proxyとして評価するための研究基盤である。
