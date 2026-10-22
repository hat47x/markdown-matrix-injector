# Issue: 特徴familyを考慮したスコア方式の候補をオフラインで比較する

この文書は当時のIssue記録です。2026年9月18日の6件のローカルテストと比較値を保持します。代替2方式による既存novel境界のmatchedへの反転を記録し、flat方式と現行閾値の維持、未採用のwarning閾値を明確に区別します。

## Meta
- Type: Evaluation / Design evidence
- Status: Done
- Priority: High
- Scope: experimental offline scorer comparison, regression tests, contributor documentation
- Expected verification level: pure unit + deterministic boundary evaluation

## Traceability
- Related ADR: `ADR-0017-fly-inspired-format-deviation-assistance.md`
- Depends on: issue-0126 Done
- Feature contract: `worksheet-format-v6` のまま
- Production matcher: 変更しない

## 背景

issue-0126で、現在のflat feature集合には列数依存のcardinality effectがあることを確認した。

とくに `column:<label>` と `column-position:<index>:<label>` は列数に比例して増える一方、table skeletonやoccupancyなどのfeature数は比較的固定される。

その結果、同じ「列名1件変更」でも、2列・3列・6列でconfidenceが異なる。

ただし、これだけではfamily weightingを導入すべきとは言えない。

- 6列中5列一致を2列中1列一致と同じ重さにすることが妥当とは限らない
- familyを均等化すると、差異を持つfamilyの影響を逆に弱める可能性がある
- capを入れると、広い表で一致している列の証拠を過小評価する可能性がある

したがって、production matcherへ変更を入れる前に、候補方式を同一fixtureでoffline比較する。

## 目的

次の4案を比較する。

1. **flat**
   - 現行matcherそのもの
   - baseline

2. **family-normalized**
   - activeなfeature familyごとにJaccard類似度を計算する
   - 各familyを等重みで平均する
   - そのfamily-normalized feature similarityを既存と同じ `0.7` とし、global sparse similarity `0.3` と合成する

3. **column-family-capped**
   - familyごとのJaccardを計算する
   - `semantic-label` と `relative-position` のみ、union feature数による寄与を上限3で頭打ちにする
   - その他familyは現在のfeature cardinalityをそのまま使う
   - sparse similarityは既存と同じglobal signatureを使う

4. **flat + balance gate**
   - runtime scoreは現行flatのまま
   - 分類を変更しない
   - 設計・fixture評価時だけ、閾値近傍やfamily構成比の偏りをwarningとして出す

## 重要な境界

このIssueで追加するscorerは**production候補の試験器**であり、production matcherの別入口ではない。

- `flyInspiredFormatMatcher.ts` は変更しない
- `worksheetFormatFeatureAdapter.ts` は変更しない
- source profileは変更しない
- `WORKSHEET_FORMAT_FEATURE_VERSION` はv6のまま
- workbook / Markdown production経路へ接続しない

## 比較式

### flat

現行は次のとおりです。

```text
confidence
  = feature Jaccard * 0.7
  + sparse Jaccard  * 0.3
```

### family-normalized

active family `F` ごとに:

```text
familySimilarity(F)
  = Jaccard(observation[F], prototype[F])
```

それを等重み平均する。

```text
featureSimilarity
  = average(active family similarities)
```

familyにfeatureが多いこと自体は重みにならない。

### column-family-capped

familyごとのsimilarityは同様に計算するが、weightを次のようにする。

```text
semantic-label / relative-position:
  weight = min(union feature count, 3)

other family:
  weight = union feature count
```

これは「列数に比例するfamilyだけを抑える」という仮説を試すための方式である。

cap=3は採用値ではない。比較用の固定値である。

### flat + balance gate

現行flat結果を変えず、次をwarning化する。

- top confidenceが `minConfidence` から0.03以内
- top-two marginが `minWinnerMargin` から0.02以内
- semantic-label + relative-positionがfeature全体の50%を超える
- 単一familyが60%を超える

これらの値もproduction契約ではなく、offline review用の初期値である。

## fixture

issue-0126で固定したv6代表feature vectorを継続利用する。

- 2列: 設定表
- 3列: コード一覧
- 6列: リリース判定表
- 近接2候補: `項目 / 値` と `項目 / 説明`
- 8列: family share警告確認用のwide table

adapterやSheetJS bridgeの正しさは既存regressionが担当する。

このIssueでは「scorerだけを変えたら、既知の境界がどう動くか」を分離して観測する。

## 結果1: exact matchは全方式で一致する

完全一致fixtureでは、3 scorerともconfidence `1.0` になる。

したがって代替方式は、exact match自体を壊してはいない。

## 結果2: 1ラベル変更の幅依存は消えず、方向も単純ではない

### 2列表

```text
flat                 0.785965
family-normalized    0.746667
column-family-capped 0.785965
```

### 6列表

```text
flat                 0.829630
family-normalized    0.853333
column-family-capped 0.870175
```

family-normalizedは2列表ではconfidenceを下げる一方、6列表では上げる。

column-family-cappedも、広い表でむしろconfidenceを強く押し上げる。

つまり「familyを均す / 列familyをcapする = 幅依存を安全に減らす」とは言えない。

## 結果3: 既存の6列表near-gate novelが反転する

既存の重要境界は次のとおりです。

```text
baseline:
ID / 項目 / 判定 / 確認者 / 備考 / 期限

observation:
ID / 項目 / 状態 / 担当者 / 備考 / 期限
```

現行flat:

```text
confidence = 0.699204
status     = novel
```

family-normalized:

```text
confidence = 0.752308
status     = matched
```

column-family-capped:

```text
confidence = 0.781781
status     = matched
```

両代替方式とも、現在のfail-closed境界を既知側へ反転させる。

これは今回もっとも重要な反例である。

## 結果4: 明確に異なる2列表は全方式でnovelを維持する

`項目 / 値` に対し `コード / 名称` を与えるケースでは、3方式とも `novel` を維持した。

したがってfamily-based scorerが常に寛容になるわけではない。

問題は、**どの種類の差異をどの表幅で軽く見るかが変わる**ことである。

## 結果5: near-tied候補は全方式でambiguousを維持する

prototype:

- `項目 / 値`
- `項目 / 説明`

observation:

- `項目 / 内容`

このケースでは3 scorerとも `ambiguous` を維持した。

winner-margin gateの概念自体は代替式でも機能する。

## 結果6: balance gateはclassificationを変えずに危険箇所を可視化できる

6列表2ラベル変更はflatの `novel` のまま、`confidence-near-gate` warningを出せる。

また8列表のように列比例familyがfeatureの過半数を占める場合、`column-family-share-high` を出せる。

したがって、現段階ではscoring式を変更せずに、**境界が不安定になりやすいfixtureをレビュー対象へ上げる**ことが可能である。

## 判断

### 1. family-normalizedは採用しない

family cardinalityの影響を消せる一方、6列表の既存novel境界をmatchedへ反転した。

現時点のfixtureでは、明確な改善より安全境界の後退が大きい。

### 2. column-family-cappedも採用しない

列比例familyの支配を抑える狙いとは逆に、wide tableではskeleton等の一致が相対的に強くなり、near-gate novelをさらにmatched側へ押し上げた。

単純なcapは安全策にならない。

### 3. 現行flat matcherを維持する

今回比較した範囲では、flat方式が既存の期待境界を最もよく維持する。

したがってproduction matcher、閾値、feature contractは変更しない。

### 4. balance gateは評価・設計補助として有望

classificationを変えず、危険なnear-gate / family-share状態だけを表面化できる。

ただし今回のwarning threshold自体はまだproduction契約ではない。

今後、fixture母集団を増やしてwarningの有用性を評価する。

## Acceptance criteria

- [x] 現行flatをbaselineとして同じfixtureで比較できる
- [x] family-normalizedをproduction matcherと分離したoffline scorerとして評価できる
- [x] column-family-cappedをofflineで評価できる
- [x] sparse similarity 30%は3 scorerで同一条件を維持する
- [x] exact matchが全方式で1.0になる
- [x] 2列/6列の1ラベル変更で方式差を固定する
- [x] 6列表2ラベル変更が代替2方式でmatchedへ反転する反例を固定する
- [x] 明確に異なる2列表は全方式でnovelを維持する
- [x] near-tied候補は全方式でambiguousを維持する
- [x] flat + balance gateがclassificationを変更しないことを固定する
- [x] matcher本体を変更しない
- [x] feature contractを変更しない
- [x] production経路へ接続しない

## Validation evidence

### 2026-09-18 local validation

実行環境は次のとおりです。

- Node.js `v22.16.0`
- TypeScript `5.8.3`
- `--strict --target ES2022 --module NodeNext --moduleResolution NodeNext`

offline comparatorと専用suiteをローカルコンパイルし、**6 tests / 6 pass / 0 fail** を確認した。

GitHub Actionsは既知のrunner/resource不足があるため完了条件に使用しない。

## 次段階

次に行うべきことはscoring式変更ではない。

1. balance warningを実務寄りfixture群へ適用する
2. warningが実際にreviewすべき境界を拾い、ノイズが過剰でないか測る
3. 特に6〜10列程度のwide table、mergeあり/なし、styleあり/なしを増やす
4. false match / false novel / ambiguousに加え、near-gate warningのprecisionを記録する
5. 十分なfixture母集団が揃った後、必要ならADRでproduction scoring変更可否を再判断する

現時点では、**flat scoringを維持し、family balanceは観測・統制する**方針を採る。
