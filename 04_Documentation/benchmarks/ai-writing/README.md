# AI執筆ベンチマーク v0

AIに設計書の章を書かせたとき、表が正本どおりになるかを測るベンチマークです。同じ依頼を「MMIなし（表を写す）」と「MMIあり」の2群に渡し、決定論的な基準で採点します。題材には[基本設計書キット](../../kits/basic-design/README.md)の正本を使います。

測定対象は表の転記と参照です。AIが書いた本文全体の業務的な正しさを保証する試験ではありません。

## 測るもの

次の指標を正本と突き合わせ、表の内容や参照が依頼どおりかを確認します。

| 指標 | 意味 |
| --- | --- |
| `tableRowsNotInSource` | 展開後の表の行のうち、正本のどの行とも一致しない数（転記誤り、作り話の行） |
| `phantomIds` | 本文にあるが正本に存在しないID（要件ID、操作IDなど） |
| `missingIds` / `unexpectedIds` | 依頼が求めた行の欠落 / 求めていない行の混入 |
| `referenceErrors` | `mmi check`のエラー数（参照を使わない文書は0） |
| 追従漏れ | 正本を1か所変えた後の`tableRowsNotInSource`。参照は追従し、写した表は古くなる |

採点は正本との突き合わせだけで、AIの判断は使いません。本文の主張（「承認できるのは承認者のみ」など）の正しさは測りません。列の絞り込みは許し、順序は保つ必要があります。

## 課題

[tasks](tasks)に5件あります。どれも表に載せる範囲を条件で絞る依頼です。

| ID | 依頼の内容 | 絞り込み |
| --- | --- | --- |
| T1 | 権限設計の章 | 全12操作 |
| T2 | 承認者の状態遷移 | 実行者が承認者の2遷移 |
| T3 | 承認画面（SC-04）の項目 | 5項目 |
| T4 | エラーメッセージ | 種別がエラーの7件 |
| T5 | 承認者向け機能 | 利用者に承認者を含む4機能 |

## 手順

まず準備用の作業フォルダーを作り、次に両群の執筆結果を採点します。最後に正本を1か所変更し、その後の追従を比較します。

`03_Implement`で`npm ci`と`npm run build`を済ませておきます。

```bash
cd 03_Implement
node --import tsx scripts/ai-writing-bench/run.ts prepare copy /tmp/bench/copy
node --import tsx scripts/ai-writing-bench/run.ts prepare mmi /tmp/bench/mmi
```

各作業フォルダーに、正本（`masters/`）、依頼文（`prompts/T*.md`）、書き込み先（`docs/`）ができます。MMIの群にはMMIのAI向け指示（`MMI.md`）が加わります。

1. 群ごとに、AIエージェントを作業フォルダーで起動し、`prompts/T1.md`〜`T5.md`を1件ずつ別の会話で渡します。AIは`docs/T*.md`を書きます。
2. 採点します。

   ```bash
   node --import tsx scripts/ai-writing-bench/score.ts ../04_Documentation/benchmarks/ai-writing/tasks/T1.json /tmp/bench/mmi/docs/T1.md --masters /tmp/bench/mmi/masters
   ```

3. 追従を測ります。正本を1か所変えて（`OP-06`の申請者を「不可」から「可」）、もう一度採点します。

   ```bash
   node --import tsx scripts/ai-writing-bench/run.ts mutate /tmp/bench/mmi
   node --import tsx scripts/ai-writing-bench/run.ts mutate /tmp/bench/copy
   ```

   変更後のT1も採点して、両群の追従を比較します。[2026年9月30日の記録](results/2026-09-30-v0.md)では、写した表で1行の不一致が生じ、MMIで参照した表は不一致0件でした。これは当時の観測結果であり、再実行で必ず同じ結果になるという意味ではありません。
4. 往復数と人手の修正回数は、会話の記録から数えて残します。

## 結果の残し方

使ったAIの種類・版・日付、課題ごとの採点結果、往復数を記録します。AIの出力は揺れるため、1回の結果を保証として扱いません。件数が少ないうちは、傾向をつかむ目的にとどめます。記録は[results](results)に置きます。採点器の合否と、人が確認する本文の正しさは区別して読みます。

## 限界

- 題材は架空の1つの正本で、課題は5件です。実案件の設計書の複雑さは表しません。
- 採点は表の行と、決まった形式のIDだけを見ます。文章中の数値や固有名詞の誤りは見ません。
- 1群につき1回の実行では、AIごとの差と揺れを分けられません。
