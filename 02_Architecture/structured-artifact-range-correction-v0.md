# 構造候補の範囲修正コスト v0

Status: research-only

## 目的

SAI-2までの評価では、候補が正解範囲へ一致したか、曖昧な場合にabstainできたかを主に測っている。

それだけでは、SIerの実作業で重要な次の問いに答えられない。

> 候補が完全一致しなかったとき、人はどれだけ直せば正しい参照にできるか。

そこで、表候補の幾何だけから計算できる、製品価値評価用の小さな共通契約を追加する。

この契約はruntimeの判断には使わない。既存のSAI-2 final holdoutも再評価しない。

## 測るもの

正解範囲と提案範囲を、ともにone-based inclusive rectangleとして比較する。

- `boundary_edit_distance`: 上・左・下・右の4境界について、正解まで動かすセル数の合計。
- `boundary_adjustment_count`: 変更が必要な境界数。0〜4。
- `over_selected_cell_count`: 正解外なのに候補へ含めたセル数。
- `under_selected_cell_count`: 正解なのに候補から漏れたセル数。
- `symmetric_difference_cell_count`: 上記2件の合計。
- `target_coverage`: 正解セルのうち候補が含んだ割合。
- `context_precision`: 候補セルのうち正解に属する割合。
- `context_expansion_ratio`: 候補セル数 / 正解セル数。
- `intersection_over_union`: 従来の幾何的一致度。

これにより、同じIoUでも「余計な周辺表を大量に含めた」「必要な行を落とした」を分けられる。

## 測らないもの

`boundary_edit_distance`は、人間の操作回数そのものではない。

一つのrange picker操作で複数境界を直せるUIもある。このためv0は、次を明示して返す。

- `geometric_proxy_only = true`
- `actual_review_actions_measured = false`
- `elapsed_time_measured = false`

実際のreview action数や所要時間を測っていない段階で、「作業時間を何%削減した」とは主張しない。

## abstain

abstainを修正距離0として扱わない。

候補を出さなかった場合、boundary distance、context量、IoU等は`null`とする。集計でもproposalの平均から除外し、`abstained_count`を別に示す。

この分離により、常にabstainする方式が見かけ上「誤差0」になることを防ぐ。

## AIへ渡す文脈との関係

`context_expansion_ratio`と`over_selected_cell_count`は、候補範囲をそのままAIへ渡した場合に増える可能性がある文脈量の、セル数によるproxyである。

byte数やtoken数そのものではない。実データを使う次段では、privacy boundaryを守ったうえで、選択されたmaterialized contextのbytes/tokensを別に測る。

v0の計算にはraw cell textを使わない。

## 研究上の境界

SAI-2A final holdoutは、すでに開封して評価が完了している。この新しい指標を後付けで同holdoutへ適用し、成功条件を増やしたことにはしない。

次の製品価値実験では、評価前に独立したfixture群と次を事前登録する。

1. 比較する候補生成・ranking方式。
2. clear target / abstain target。
3. correction metricの優先順位。
4. 許容するabstention。
5. 実際のreview action / elapsed timeを測るか。
6. materialized context bytes/tokensを測るか。
7. 評価後にthresholdやtargetを変更しないこと。

## 製品価値との接続

MMIが目指すのは、表分類器の精度を最大化することではない。

利用者がExcel等の原本を書き換えずに、次を実現できることが重要である。

- 欲しい範囲へ短く到達できる。
- 余計な範囲をAIへ渡しにくい。
- 足りない範囲を見落としにくい。
- 曖昧なら自動確定せず、明示指定へ戻れる。

この契約は、そのうち最初の三点を幾何的proxyとして測るための研究基盤である。
