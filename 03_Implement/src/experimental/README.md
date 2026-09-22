# Fly-inspired worksheet format recognition

このディレクトリは、Excel設計書の書式候補を**読み取り専用で補助判定する実験層**です。

Markdown Matrix Injector本体の決定論的な読み込み・変換・Markdown生成経路とは分離されています。ここで得た候補が、Excel、format definition、Markdownを自動変更することはありません。

このREADMEは、ハエ脳、FlyHash、SheetJS内部実装を事前に知らなくても、通常のTypeScriptとExcelデータ処理の知識から安全に参画できることを目的にしています。

## 1. 最初に理解すること

この実験層が答える問いは1つです。

> 今回のworksheetは、既知のどの書式に近いか。あるいは、安全に既知書式へ分類できないか。

結果は次の3種類です。

- `matched`: 1つの既知書式へ十分近く、他候補との差も十分ある
- `ambiguous`: 既知候補としては十分近いが、上位候補の差が小さく1つへ決められない
- `novel`: 既知書式と呼べるだけの証拠が足りない

`novel`と`ambiguous`は異常ではありません。誤認識を避けるためのfail-closed結果です。

## 2. データフロー

```text
XLSX
  |
  v
SheetJS read-only reader
  |
  v
WorksheetFormatSnapshot
  |  cell text / row / column / merge / optional style
  v
worksheetFormatFeatureAdapter
  |  書式を表す抽象featureへ変換
  v
source profile filter
  |  入力経路で保証されるevidenceだけ残す
  +-----------------------+
  |                       |
  v                       v
known prototype       observation
  |                       |
  +-----------+-----------+
              |
              v
flyInspiredFormatMatcher
  |  deterministic sparse projection + similarity + gates
  v
matched / ambiguous / novel
```

各層の責務を混ぜないことが最重要ルールです。

## 3. ファイルごとの役割

### `flyInspiredFormatMatcher.ts`

抽象feature文字列だけを扱います。Excel、セル、SheetJS、styleを知りません。

処理は通常の計算機科学用語で説明できます。

1. featureを正規化する
2. 安定hashで固定次元へ複数投影する
3. activationの強いbucketだけを残す
4. feature集合と疎signatureのJaccard類似度を計算する
5. confidence / DeviationScoreを作る
6. `minConfidence` と `minWinnerMargin` で3状態へ分類する

「Fly-inspired」は着想元です。SNN、connectome simulation、学習済みモデルを実行しているわけではありません。

### `worksheetFormatFeatureAdapter.ts`

`WorksheetFormatSnapshot`をmatcher向けfeatureへ変換します。

現在の主なstructure feature:

- header列ラベル
- 表左端からの相対列位置
- headerが連続かgappedか
- title mergeのheader重なり幅
- titleとheaderの行間隔
- 最初の本文候補行が存在するか
- headerから最初の本文候補行までの行間隔
- 最初の本文候補行がheader列をfullに埋めるかpartialか
- 本文先頭側の複数行で、各header列が過半数の行に出現するか
- headerの横方向mergeが、どの隣接列境界を接続するか
- 本文先頭側で繰り返される横方向mergeの相対shape

style evidenceとしてfill / borderも受け取れますが、実際に比較へ使えるかはsource profileが決めます。

### `worksheetFormatPrototype.ts`

prototype作成、feature contract version、source profile境界を担当します。

prototypeは手書きfeature一覧にしません。必ず観測と同じadapterへbaseline snapshotを通して作ります。

## 4. v4までの table skeleton evidence

v4では、2列表のように列ラベルだけでは情報量が少ないケースを支えるため、**表の意味ではなく、タイトル→ヘッダー→本文という配置骨格**を追加しました。

### `layout:title-header-gap:<n>`

title mergeとheaderの間に何行あるかを表します。隣接していれば0です。

### `body:present`

headerより下、かつ表の水平範囲内に非空セルがあることを表します。

### `layout:first-body-gap:<n>`

headerと最初の本文候補行の間に何行あるかを表します。

### `layout:first-body-coverage:full|partial`

最初の本文候補行が、headerで実際に使われている列をすべて埋めているかを表します。

これらは値の意味を推論するfeatureではありません。`30`が数値かコードか、`01`がIDか数値かは判断しません。

## 5. v5の body majority occupancy

`worksheet-format-v5`では、最初の本文行だけでなく、複数本文行に繰り返される**列の埋まり方**を1つのstructure featureへ圧縮しました。

```text
layout:body-majority-occupancy:<bits>
```

2列表なら、たとえば次のようになります。

```text
項目 | 値
-----+----
a    | 1
b    |
c    | 3
```

2列目は3行中2行で埋まっているので、majority occupancyは次です。

```text
layout:body-majority-occupancy:11
```

一方、2列目が3行中1行しか埋まっていなければ次になります。

```text
layout:body-majority-occupancy:10
```

### 判定規則

headerより下で、headerの水平範囲内に非空セルを持つ本文候補行を上から最大4行まで観測します。

各header列について、観測行の**過半数**に非空セルがあれば `1`、それ以外なら `0` とします。

偶数行でちょうど半数の場合は `0` です。曖昧な証拠を強く見積もらないための保守的な扱いです。

### なぜ本文行数をfeatureにしないのか

同じ書式でも、あるファイルでは3件、別のファイルでは1件しかデータがないことがあります。

そこで、`body:rows:3`のようなfeatureは作りません。1行しか観測できない場合も、その1行から同じmajority maskを作ります。

このため、同じ列が埋まっている1行表と3行表は、行数の違いだけでは別書式になりません。

## 6. v6の horizontal merge shape

`worksheet-format-v6`では、横方向mergeを**表内の隣接列境界の接続パターン**として扱います。

4列の表には列間境界が3つあります。

```text
A | B | C | D
  0   1   2
```

B:Cだけが横方向mergeなら、具体shapeは次です。

```text
layout:header-horizontal-merge-links:010
```

このbitはExcel全体のB列・C列を意味しません。表の左端から見た相対境界です。したがって同じ表をA:DからH:Kへ移動してもmaskは変わりません。

### headerのfeature

header rowに横方向mergeがある場合、2段階のfeatureを出します。

```text
merge:header-horizontal-present
layout:header-horizontal-merge-links:<bits>
```

前者は「headerに横mergeがある」という粗い特徴、後者は「どの境界がつながっているか」という細かい特徴です。

### bodyのfeature

本文は単発のmergeをformat identityへ入れません。v5と同じ先頭最大4本文行を使い、各境界が**厳格過半数**の行でmergeされている場合だけ recurring shape とします。

```text
merge:body-horizontal-recurring
layout:body-majority-horizontal-merge-links:<bits>
```

たとえば4列表のA:Bが3本文行中2行でmergeされている場合は次です。

```text
layout:body-majority-horizontal-merge-links:100
```

3行中1行だけならfeature自体を出しません。偶発的な装飾を基準書式へ固定しないためです。

### なぜmerge個数を数えないのか

「本文にmergeが3個ある」のように数えると、同じ行shapeを持つデータが1行から3行へ増えただけで書式差になってしまいます。

v6では行数を数えず、繰り返し現れる**相対shape**だけを残します。1本文行しか観測できず、その行がmergeされている場合は、その1行から同じmaskを作れます。

### なぜ `merge:none` を作らないのか

mergeが無い表すべてへ共通featureを追加すると、無関係な表同士の類似度を機械的に押し上げます。

そのため、v6では実際に採用対象となる横mergeが観測できた場合だけmerge featureを追加します。

### なぜ縦方向mergeを含めないのか

v6のfeatureは「同一行の隣接列境界が横方向に接続される」という1つの意味へ限定します。

`startRow !== endRow` の縦方向・矩形mergeは除外します。必要性が確認できれば、別Issueで独立したfeatureとして設計します。

## 7. なぜ絶対行列番号を使わないのか

同じ書式がA列開始でもE列開始でも、通常は同じ表です。

そのため列位置は表左端からの相対位置を使います。また、title/bodyの行位置も絶対行番号ではなくheaderとの距離を使います。

body majority occupancyはheader列順、horizontal merge shapeは表内の列境界順をbit位置として使います。

水平・垂直に表全体が移動しただけで書式identityを変えないためです。

## 8. Source profile

source profileは、入力経路ごとに「どのevidenceを比較契約へ含めてよいか」を決めます。

現在の保守的なSheetJS CE XLSX 0.20.3 profile:

```text
structure: yes
fill:      yes
border:    no
```

body occupancyとmerge shapeはセル位置・merge rangeだけから得られるため、`structure` evidenceとして扱います。

`fill: yes` は「Excelのあらゆる色指定を必ず解決できる」という意味ではありません。issue-0132ではLibreOfficeが最終保存したXLSX fixtureを使い、direct RGB solid fill（`FF202020` / `FF404040`）が既存reader・bridgeを通って `header:fill-present` / `header:dark-fill` となり、このsource profileの比較evidenceへ残ることを契約テスト化しました。

issue-0133ではLibreOffice最終保存のtheme-indexed fixtureを追加し、SheetJS CE 0.20.3がtheme color schemeとtintをRGBへ解決してからbridgeへ渡す境界を固定しました。theme 3 / dark2は `1F497D -> dark`、theme 3 + tint 0.8は `C6D9F1 -> light` として既存fill evidenceへ入ります。

MMI bridgeはtheme XMLを自力で解決しません。resolved RGBが無いtheme styleは引き続き保守的に `other` とし、adapterはmeaningful fill evidenceへ採用しません。

issue-0134ではさらに、同じsnapshot群を `structure + fill` / `structure only` で対比較し、fill evidenceの**識別価値と副作用**を評価しました。fill-onlyでしか区別できないprototypeをdisambiguateできる一方、共通fillが構造差を薄めて `novel -> matched` を起こすケースもあります。そのためfillは補助証拠として維持しますが、weightを強めません。

issue-0139では、fillの有無やtone差を一律warningにせず、fillが実際にstatus/winnerを変えた `decision-impact` と、構造的に同一なfill-only候補群なのにfillが欠けた `essential-unavailable` をreview telemetryとして分離しました。広い `fill-unavailable` / tone disagreementはdiagnostic factに留めます。

issue-0140ではこのtelemetryをLibreOffice由来external XLSXへ持ち込み、Theme Dark / Theme Light Tint、RGB Fill、Metadata Gapped、No Titleを実reader経路から再利用するpractical corpusを追加しました。新しいCognitive Contract / Fly Perception / Format Profile / Judgment契約へはまだ接続せず、deterministic worksheet comparisonの品質確認を先行します。

adapterが値を受け取れることと、実入力経路がその値を安定して供給することは別です。後者を確認できない情報は比較契約へ入れません。

## 9. Feature contract version

`WORKSHEET_FORMAT_FEATURE_VERSION`は表示用ではありません。

featureの種類や意味が変わると、旧prototypeと新observationのDeviationScoreを同じ尺度として扱えなくなるため、version不一致は比較前に拒否します。

v6ではhorizontal merge shapeが加わったため、v5 prototypeとv6 observationは比較しません。

featureを変更した場合は、少なくとも次を同じ変更単位で確認してください。

1. adapterの出力
2. `WORKSHEET_FORMAT_FEATURE_VERSION`
3. prototypeのversion gate
4. version固定値を持つ既存回帰
5. boundary evaluation
6. このREADMEと関連Issue

## 10. matcherの既定境界

```text
minConfidence = 0.7
minWinnerMargin = 0.05
```

概念的な判定順序:

```text
best confidence < 0.7
    -> novel

bestは0.7以上だが、secondとの差 < 0.05
    -> ambiguous

otherwise
    -> matched
```

疎hashではbucket衝突のため、意味上対称な2候補でもconfidenceが完全同値とは限りません。したがってambiguousの契約は「同点」ではなく**上位差が `minWinnerMargin` 未満**であることです。

## 11. 現在分かっている境界

### 2列表の列名1件変更

merge差がない通常表では、v5から引き継いだtable skeletonとoccupancyにより、`structure only`でも候補として残る。

### 単発の空欄

3本文行のうち1行だけ同じ列が空欄でも、残る2行で埋まっていればmajority occupancyは変わりません。

### 継続するoccupancy差

列名変更に加えて同じ列の欠損が多数派になる場合は、既知書式へ無理に寄せず `novel` へ落ちる境界を維持します。

### merge shape差だけの場合

同じラベル・同じoccupancyで、recurring horizontal mergeだけが消えたり位置を変えたりするケースは、merge差をDeviationとして残しつつ、それだけで直ちに別書式とはしません。

merge shapeは分類を単独支配するfeatureではなく、他の構造証拠を補助する位置づけです。

### merge shape差と列名変更が重なる場合

2列表のstructure-only評価では、recurring mergeの消失と列名1件変更が同時に起きるケースを `novel` とすることを専用回帰で固定しています。

つまりv6は「mergeが違うから即別書式」でも「mergeは無視」でもなく、**複数の独立した差異が重なったときに安全側の判断を強める**設計です。

## 12. テストを読む順番

初めて参画する場合は次の順を推奨します。

1. `worksheetFormatFeatureAdapter.test.ts` — snapshotから基本featureがどう作られるか
2. `worksheetFormatStructuralFeatures.test.ts` — 相対位置、gap、title/body skeleton
3. `worksheetFormatBodyOccupancy.test.ts` — 複数本文行のoccupancyをどう粗くまとめるか
4. `worksheetFormatMergeShape.test.ts` — 横方向mergeを相対shapeへどう圧縮するか
5. `worksheetFormatHierarchy.test.ts` — 粗いfeatureと細かいfeatureをなぜ重ねるか
6. `worksheetFormatPrototype.test.ts` — source profileとversion gate
7. `worksheetFormatBoundaryEvaluation.test.ts` — 何を吸収し、どこで止まるか
8. `worksheetFormatFeatureFamilyEvaluation.test.ts` — feature familyの件数偏りをどう測るか
9. `worksheetFormatScoringStrategyComparison.test.ts` — scoring候補をproduction変更なしでどう比較するか
10. `worksheetFormatBalanceWarningEvaluation.test.ts` — warningのprecision / recallと役割差をどう評価するか
11. `worksheetFormatMultiFamilyDriftEvaluation.test.ts` — held-out fixtureでmulti-family drift signalをどう比較するか
12. `xlsxFormatSnapshotReader.test.ts` — reader option / error handlingをfake readerでどう固定するか
13. `sheetJsWorksheetFormatBridge.test.ts` — SheetJS worksheet objectからsnapshotへの変換規則
14. `xlsxFormatSnapshotRealRuntime.test.ts` — SheetJS自身が生成した実XLSX bytesを通すruntime境界
15. `xlsxFormatSnapshotLibreOfficeFixture.test.ts` — LibreOffice最終保存XLSXでdirect RGB fillと構造境界を確認
16. `xlsxFormatSnapshotThemeFixture.test.ts` — 外部theme/tint fillがSheetJSでRGB解決される境界を確認
17. `theme-fill-boundary.md` — parser / bridge / adapterのtheme責務分離
18. `worksheetFormatFillEvidenceEvaluation.test.ts` — fillあり/なしを同じsnapshotで対比較し、識別価値と境界反転を確認
19. `fill-evidence-value.md` — fillが候補confidence / winner marginへ与える影響
20. `worksheetFormatFillReviewTelemetry.test.ts` — fill impact reason codeを6/8列held-out corpusで評価
21. `fill-review-telemetry.md` — availability / disagreement / decision-impactの意味分離
22. `worksheetFormatFillReviewTelemetryExternalXlsx.test.ts` — LibreOffice external XLSXからreader経由でtelemetryを再評価
23. `external-xlsx-fill-telemetry.md` — 実XLSX corpusとCognitive Assistance Planeとの境界
24. `worksheetFormatFillImpactFamilyExternalXlsx.test.ts` — 同一external template familyで残り4つのdecision-impact reasonを固定
25. `external-fill-impact-family.md` — supported acceptance / ambiguity / rejection / changed winnerの読み方
26. `deterministicReviewEvidence.test.ts` — deterministic reasonをCognitive/Authorityと分離してreview surfaceへ合成
27. `../../02_Architecture/deterministic-review-evidence-overlay-v1.md` — reason provenance / binding / non-authority境界
28. `unifiedHumanReviewViewModel.test.ts` — Proposal / Authority / Cognitive / Deterministicを4領域へ分離
29. `unifiedHumanReviewPresentationPlan.test.ts` — 4領域の表示順と既定展開をoverall verdictなしで固定
30. `../../02_Architecture/unified-human-review-presentation-plan-v1.md` — progressive disclosureとcross-domain非連動境界
31. `worksheetFormatFillReviewAnalysis.test.ts` — evaluation labelに依存しないfill review analysis
32. `worksheetFormatProfileReviewAnalysis.test.ts` — approved Format Profileからbaseline snapshotなしでfill reviewを再構成
33. `executableProposalDeterministicReviewWorkflow.test.ts` — Profile-backed analysisからUnifiedHumanReviewViewModelまでを単一workflowで合成
34. `../../02_Architecture/executable-proposal-deterministic-review-workflow-v1.md` — orchestrationのbinding / fail-closed順序
35. `containedUnifiedReviewWorkflow.test.ts` — stable read window内の同一snapshotをPerceptionとdeterministic analysisへ共有
36. `../../02_Architecture/contained-unified-review-workflow-v1.md` — safe orchestration by construction
37. `worksheetFormatObservationIdentity.test.ts` — compared format featuresのderived-state identityとprivacy境界
38. `../../02_Architecture/worksheet-format-observation-identity-v1.md` — Perception / low-level review間のidentity binding
39. `worksheetReviewRouteEvaluation.test.ts` — inspect/routineの非対称error・coverage・Brier・projection separability
40. `worksheetReviewRouteLabelCorpus.test.ts` — provider-blinded independent label corpus
41. `worksheetReviewRouteAnnotationPacket.test.ts` — labeler向けblinded annotation packetとstale response防止
42. `worksheetReviewRouteAdjudicationPacket.test.ts` — 匿名化annotationを使うblinded adjudicationとfinal label確定
43. `../../02_Architecture/worksheet-review-route-adjudication-packet-v1.md` — adjudicator visibility / digest / self-review禁止
44. `worksheetReviewRouteEvaluationPacket.test.ts` — ground truthをproviderへ見せないprojection packetとstrict outcome join
45. `../../02_Architecture/worksheet-review-route-evaluation-packet-v1.md` — provider-input digest / ground-truth digest分離とevaluation boundary
46. `test/fixtures/README.md` — 外部生成fixtureのprovenanceとSHA-256
47. `flyInspiredFormatMatcher.test.ts` — matcher一般規則

## 13. 安全に変更するためのチェックリスト

- 変更はreader / adapter / profile / matcherのどの層かを明示したか
- 別層の責務を持ち込んでいないか
- 同じ入力から同じfeatureが得られるか
- 絶対行列位置へ不必要に依存していないか
- データ件数そのものをformat identityへ混入させていないか
- 単発のmergeや空欄を繰り返し構造として過大評価していないか
- prototypeとobservationが同じadapterを通るか
- 観測できないevidenceを補完・推測していないか
- `novel` / `ambiguous`を閾値緩和で安易に`matched`へしていないか
- feature意味変更時にversionを上げたか
- 既存version固定テストを更新したか
- 境界テストに「似ている例」と「似ていない例」の両方があるか
- 専門用語を通常の実装用語でも説明したか
- GitHub Actionsが使えない場合、ローカルstrict compileと関連testを記録したか

## 14. この層が行わないこと

- Excelを書き換える
- format definitionを書き換える
- Markdownを書き換える
- 候補を自動採用してproduction処理を進める
- LLMや外部APIへデータを送る
- 実行ごとに学習して挙動を変える
- セル値の業務上の意味を推論する
- 縦方向mergeの意味を推論する

この非責務が変わる場合は、実装Issueではなくアーキテクチャ変更として扱ってください。

## 15. 次に改善する場合

v3〜v6で主要なstructure evidenceを追加した後、issue-0126〜0128では「featureを増やす」より先に、既存evidenceとwarningの効き方を測っています。

現在分かっていること:

- family cardinalityには表幅依存がある
- family-normalized / column-family-capped scoringは既存のfail-closed境界を後退させるため採用しない
- boundary warningは高precisionだがlow recall
- composition warningは個別workbook判定ではなくdesign telemetryとして読む
- warningなしでも、label + occupancyのようなmulti-family driftを取り逃す場合がある

issue-0129では、issue-0128とは独立した5 / 7 / 9列のheld-out fixtureでmulti-family drift signalを比較しました。

分かったこと:

- boundary warningは引き続き高precision / low recall
- matched DeviationScoreとraw different-family countはそれぞれ異なる種類のdriftを補完的に拾う
- penalizing ablation-family countは疎signatureの再構成に影響され、review detectorとしてはraw family differenceより不安定
- boundary + deviation + different-family countは18ケースでは全review対象を拾ったが、fixture数が少なくsyntheticなためproduction ruleにはしない

issue-0130ではadapterを通すsnapshot-level fixtureへ進み、issue-0131ではSheetJS CE 0.20.3自身が生成した実XLSX bytesをreaderへ戻すruntime boundary testを追加しました。issue-0132ではさらに、**LibreOffice Calcが最終保存した外部生成XLSX**をbase64 fixtureとして固定し、direct RGB fillをsource-profile evidenceとして読める境界を追加しました。

現在確認対象として固定している境界:

- merge rangeは `!merges` からsnapshotへ保持する
- mergeに覆われた従属cellをbridge側でinventしない
- blank positionを通常cellとしてinventしない
- metadata preambleでheader identityを変えない
- titleなし表へtitle evidenceを補わない
- gapped headerの物理gapをrelative structureとして残す
- 実XLSX snapshotからprototype / matcherへ進んでもmulti-family drift identityを保持する
- LibreOffice最終保存のdirect RGB solid fillは `header:fill-present` / `header:dark-fill` として比較evidenceへ残す
- LibreOffice最終保存のtheme/tint fillも、SheetJSがRGBへ解決できる場合は同じfill evidenceへ正規化する
- theme indexだけがありresolved RGBが無い場合はbridgeで `other` とし、推測で補わない
- theme XML / tint algorithmをMMI側へ重複実装しない
- fillは候補識別に有用だが、共通fillが構造差を薄める場合がある
- 4列2ラベル変更ではstructure-onlyの `novel 0.675441` がfill一致で `matched 0.724571` へ反転する
- 同一構造dark/light prototypeはfill込みでmargin `0.098930` を得てdisambiguateできる
- correct structureとfill一致candidateが競合すると、fillがwinner marginを狭めてambiguousへ安全停止させる場合がある

issue-0139ではfill availability / disagreementを6列・8列の20ケースでheld-out評価しました。

分かったこと:

- status/winnerを実際に変えたdecision-impactはprecision 1.0 / recall 0.75
- structurally equivalentなfill-only候補群でfillが欠けたessential-unavailableを加えると、このcorpusではprecision / recall 1.0
- broad `fill-unavailable` はprecision 0.333333
- tone disagreement単独はreview precision 0
- すべてのfill factを1つのwarningへ潰すとfalse-positive rate 0.5

issue-0140ではhigh-impact reason codeをexternal-XLSX / adapter由来の9ケースへ持ち込みました。

corpusは:

- Theme Dark exact
- Theme Dark vs Theme Dark / Theme Light Tint
- Theme Dark fill unavailable
- Theme Light Tint vs Theme Dark
- Theme Dark fill missing exact
- RGB Fill exact
- Metadata Gapped exact
- Metadata Gapped fill missing
- No Title exact

です。6ケースはreader snapshotを無加工で使い、3ケースだけfill availabilityを再現するため `fillTone` のみ除去します。

repository runtime testへ固定した期待:

- decision-impact: precision 1.0 / recall 0.5
- essential-unavailable: precision 1.0 / recall 0.5
- high-impact union: precision 1.0 / recall 1.0
- broad fill-unavailable: precision 0.333333
- broad tone disagreement: precision 0
- all telemetry一括: precision 0.4 / FPR 0.428571

ただし現在の作業環境では`xlsx@0.20.3` dependency treeを持たないため、このruntime testのpassはまだ主張しません。

issue-0146では、同じlayout familyを持つLibreOffice最終保存XLSXを追加し、issue-0140で未確認だった4つのdecision-impact reasonをexternal reader経路へ移しました。

確認対象:

- 6列2ラベル差 + same dark fill: `fill-supported-acceptance`
- 6列exact/no-fill vs one-label-wrong/dark candidate: `fill-induced-ambiguity`
- 8列2ラベル差 + same dark fill: `fill-induced-rejection`
- 3列dark observation vs structurally近いdark/light候補: `fill-changed-winner`

特にchanged-winnerでは、structure-only topがlight候補B、fill-aware topがdark候補Aへ入れ替わり、`fill-supported-disambiguation` / `fill-changed-winner` / broad `fill-tone-disagreement` を別reasonとして同時に保持します。

この7-case corpusはreason codeを意図的に再現する**coverage evidence**であり、held-out population上のprecision benchmarkではありません。decision-impact precision/recallが1.0でもproduction gate採用根拠にはしません。

issue-0154では、external XLSXまで確認したdeterministic review reasonをCognitive / Authorityへ混ぜずにhuman-review surfaceへ露出する最小contractを追加しました。

新しい構造:

```text
existing verified human-review surface
  + deterministic review evidence
        |
        v
DeterministicReviewEvidenceSurfaceV1
```

重要な境界:

- Cognitive Perception / Judgmentへreasonを入れない
- Authority receipt / verification checkへreasonを入れない
- deterministic producerはprovider descriptorを名乗らない
- `expectedReview`、raw cells、raw feature vectorをartifactへ持ち込まない
- fill-aware primary matcher resultがEnvelopeのFly Perception payloadとcandidate順・scoreまで一致しなければfail-closed
- attachment時にもschema / producer / provenance / reason分類 / reason count / primary comparisonを再検証
- review-relevant reasonがあってもauto rejectしない
- reasonがなくてもauto acceptしない
- existing review-only / no-write / not-authorized境界を変更しない

issue-0155では、Proposal Identity / Authority / Cognitive / Deterministicを混ぜずに表示する `UnifiedHumanReviewViewModelV1` を追加しました。overall verdictやcombined scoreは持ちません。

issue-0156では、fill review reason生成を `expectedReview` などの評価ラベルから分離し、label-freeなanalysis contractへ切り出しました。

issue-0157では、approved Format Profileのcanonical featuresからfill-aware / structure-only prototypeを再構成できるようにし、runtime reviewでbaseline worksheet snapshotを保持しなくてよいProfile-backed analysisを追加しました。

issue-0158では、contained sourceのstable read window内でWorksheet snapshotを読み、canonical source identity付きObservationとFly Perceptionを生成するworkflowを追加しました。raw cells/featuresはObservationへ保持しません。

issue-0159では、これら既存contractを再実装せず、安全な単一orchestrationへまとめます。

```text
observation snapshot
 + approved Format Profiles
 + Cognitive Review Envelope
 + executable proposal
        |
        v
issue-0157 Profile-backed analysis
        |
        v
issue-0154 DeterministicReviewEvidence
        |
        v
issue-0150 proposal / Authority workflow
        |
        v
issue-0155 UnifiedHumanReviewViewModelV1
```

追加した境界:

- baseline prototype snapshotをruntime inputから除外
- `expectedReview` / telemetry / prepared evidence / matcher optionsをinputへ持ち込まない
- approved Profile objectをEnvelope Profile refへ照合
- Profile-backed再match結果をissue-0154でFly Perceptionへcandidate単位でbinding
- deterministic input不一致時はWorkbook loaderを呼ぶ前にfail-closed
- AuthorityがblockedでもCognitive / deterministic domainを改変しない
- 最終出力は新schemaを作らずissue-0155 view modelをそのまま利用

issue-0160では、contained sourceのstable read window内でsnapshot readerを1回だけ呼び、その**同一snapshot object**をFly PerceptionとProfile-backed deterministic analysisへ内部供給するsafe orchestrationを追加しました。callerへsnapshotやprepared Envelopeを返さないため、通常の上位経路ではsnapshot取り違えを構造的に防ぎます。

並行してissue-0161 / 0162ではclosed-choice Judgment provider portとJev Choice transport adapterを整備しています。これはJudgment実行境界のレーンであり、worksheet-format Perception / observation identityとは責務を分離しています。

issue-0163では、issue-0160のstable Perceptionからreview-route専用の派生Observationを作り、provider-neutralなclosed-choice Judgmentをasyncに接続するprovider-backed pathを追加しました。raw worksheet / featuresはprovider Observationへ渡さず、external providerはexplicit opt-inを維持します。

issue-0164では、上記safe pathを置き換えず、低レベルissue-0159 APIと監査性を補強する `WorksheetFormatObservationIdentityV1` を追加しました。

identityはsource file hashでもexact snapshot hashでもなく、current source profileでmatcherが実際に比較したnormalized format featuresのSHA-256 bindingです。

- body cell値だけが変わりformat featuresが同じならidentityも同じ
- header/fill/merge/skeleton等のcompared feature stateが変わればidentityも変わる
- sourceDigest / featureVersion / sourceProfile / sourceEvidenceもdigestへbinding
- raw cells / raw feature vectorはidentity artifactへ保存しない
- Fly Perception payload内部に保持し、Review Envelope生成時にprovenanceを再検証
- issue-0159ではobservation snapshotから再計算し、identity mismatchをAuthority loader前にfail-closed
- issue-0160の最終UnifiedHumanReviewViewModelにはidentityを既定表示しない
- hashを匿名化・機密化とは扱わず、external provider opt-in原則は維持

issue-0178では、`UnifiedHumanReviewViewModelV1` を変更せず、その上にUI-neutralな `UnifiedHumanReviewPresentationPlanV1` を追加しました。

固定した表示順:

1. Authority
2. Cognitive
3. Deterministic
4. Proposal Identity

既定展開は各domain自身の事実だけから決めます。

- Authority: blockedのみexpanded
- Cognitive: ambiguous / novel、またはJudgment proposal / non-decisionでexpanded
- Deterministic: review-relevant reasonがある場合だけexpanded
- diagnostic-only reasonだけでは自動展開しない
- Proposal Identityは常にcollapsed

section間の連動、overall verdict、combined score、recommendation、auto accept / reject、apply authorityは導入しません。

次に進む場合もproduction wiringへ直結せず、実UIへ接続する前にラベル文言・アクセシビリティ・キーボード操作・details disclosure semanticsを別UI contractとして評価します。

詳細は `balance-warning-evaluation.md`、`multifamily-drift-evaluation.md`、`snapshot-drift-evaluation.md`、`real-xlsx-runtime-boundary.md`、`theme-fill-boundary.md`、`fill-evidence-value.md`、`fill-review-telemetry.md`、`external-xlsx-fill-telemetry.md`、`external-fill-impact-family.md`、`../../02_Architecture/deterministic-review-evidence-overlay-v1.md`、`../../02_Architecture/unified-human-review-view-model-v1.md`、`../../02_Architecture/executable-proposal-deterministic-review-workflow-v1.md`、`../../02_Architecture/contained-unified-review-workflow-v1.md`、`../../02_Architecture/worksheet-format-observation-identity-v1.md`、`test/fixtures/README.md`、issue-0128〜0178 を参照してください。

十分な外部生成fixtureと安全境界が揃うまでは、warningやreview signalを自動accept / reject条件へ昇格させず、production接続可否も別ADR/Issueで判断します。


### Review-route evaluation data lane

issue-0167〜0170では、live providerやproduction routingを変更せず、review-route Judgmentを独立に評価できるground-truth作成レーンを整備しています。

順序:

1. issue-0167: provider-neutral evaluation metrics
2. issue-0168: provider-blinded label corpus
3. issue-0169: labeler向けblinded annotation packet
4. issue-0170: adjudicator向けblinded adjudication packet
5. issue-0171: provider評価前のground-truth readiness report
6. issue-0172: provider向けblinded projection packet + adjudicated label strict evaluation
7. issue-0173: resume-safe blinded annotation work allocation
8. issue-0174: readiness-gated provider-neutral evaluation runner + Jev parity adapter
9. issue-0175: resume-safe blinded adjudication work allocation
10. issue-0176: predeclared evaluation plan manifest
11. issue-0177: immutable provider-evaluation record + offline ground-truth re-evaluation
12. issue-0179: canonical evaluation-record JSON codec

issue-0178はこのevaluation laneとは別のhuman-review presentation laneとして並行実装済みです。

issue-0170では、2件以上の独立annotationがある未adjudicated caseだけを対象にし、adjudicatorへはevidenceと匿名化したroute/rationaleだけを提示します。annotator identity / projectionState / provider/model/confidenceは見せません。

packet digestはevidenceとannotation集合の双方へbindingされるため、annotation後のevidence変更・annotation変更・追加/削除はstale responseとしてrejectされます。

adjudicator自身が元annotatorだったcaseもapply時にrejectします。多数決やunanimous labelの自動確定は行わず、final routeは明示的human adjudicationとしてのみcorpusへ追加します。

このレーンのinspect / routineはいずれもhuman reviewを要求し、apply authorityやautomatic decisionを持ちません。


issue-0171では、provider benchmark前にground-truth corpusの構造的な準備状態を確認する `WorksheetReviewRouteEvaluationReadinessV1` を追加します。

readinessはcallerが事前指定したminimum adjudicated cases / case families / both-route requirement / projection coverage / all-case adjudication policyに対するblockerを返すだけで、default sample sizeや統計的十分性を暗黙に決めません。

issue-0172では、provider評価時のground-truth leakageとmanual join errorを避けるため、adjudicated corpusからprovider-visible projection stateだけを抽出する `WorksheetReviewRouteEvaluationPacketV1` を追加します。

provider packetに含めるのはcase id / canonical inspect-routine question / classification / candidateCount / hasWinner / noveltyScoreだけです。expected route、evidence、annotations、adjudication、provider/model identity、probability/confidenceは含めません。

packetDigestはprovider-visible state集合へbindingし、final routeは意図的にdigest inputから除外します。一方evaluation reportには別の `groundTruthDigest` を持ち、current adjudicated final routesをbindingします。

この分離により、projection stateが変わらずfinal labelだけ訂正された場合はprovider inference resultを再利用しつつ、どのground-truth versionで評価したかをreportへ残せます。

responseはpacket case集合との完全一致を要求し、missing / extra / duplicate case、stale packet、mixed provider descriptor、wrong review-route questionをfail-closedします。metric計算はissue-0167の既存evaluatorを再利用し、新しいaccuracy定義は導入しません。


### Resume-safe annotation work allocation

issue-0173では、annotation作業を中断・再開しても同じannotatorへ処理済みcaseを再提示せず、必要な独立annotation数を満たしたcaseへ3件目以降を過剰配布しない `WorksheetReviewRouteAnnotationWorkPacketV1` を追加します。

独立annotation必要数は `WORKSHEET_REVIEW_ROUTE_REQUIRED_INDEPENDENT_ANNOTATIONS` をlabel corpus / annotation allocation / adjudicationで共有します。packet生成時のannotatorRefはfilterにのみ使い、packet本体には既存annotation・annotator identity・projectionState・provider情報を保持しません。

response apply時にはcurrent corpusから同じannotatorRefでpacketを再生成し、digest不一致をstale responseとして拒否します。2件の独立annotationが揃ったcaseはannotation workから外れ、issue-0170のhuman adjudicationへ進みます。


### Resume-safe adjudication work allocation

issue-0175では、issue-0170のglobal adjudication packetを担当者別のresume-safe work queueへ拡張する `WorksheetReviewRouteAdjudicationWorkPacketV1` を追加します。

current adjudicatorが対象caseの元annotatorだった場合、そのcaseは**提示前**にwork packetから除外します。adjudicatorRefはfilterにだけ使い、packet本体やdigest inputへは含めません。同じeligible setを見る複数adjudicatorは同じblinded packet digestを得ます。

responseはpacket全件の完了を要求せずpartial applyを許可します。apply後にcurrent corpusから同じadjudicatorRefでpacketを再生成すると、完了済みcaseだけが消え、remaining workをそのまま再開できます。

work responseのstale検出・case eligibility確認後、final adjudication適用はissue-0170の `applyWorksheetReviewRouteAdjudicationResponse` へ委譲します。adjudicationReference生成、strict corpus validation、self-review最終防御はcanonical pathへ一本化し、allocation層では再実装しません。

self-ineligibleでpacketに見えていないcaseだけが変化してもvisible work digestは変えません。一方、他のadjudicatorがvisible caseを先にadjudicateするなどeligible setが変われば古いresponseはstaleとしてrejectします。lock/leaseではなくoptimistic stale detectionとして扱います。


### Readiness-gated provider evaluation

issue-0174では、0171 readinessをprovider実行より前に必ず評価し、not-readyならprovider call 0でblocked resultを返す `runWorksheetReviewRouteEvaluation` を追加します。

readyな場合だけ0172 evaluation packetの各caseを、classification / candidateCount / hasWinner / noveltyScoreだけを持つevaluation専用Observationへ変換し、issue-0161のprovider runnerへ渡します。expected routeやevidenceはprovider pathへ入りません。

Jev評価ではproduction Observationへ合わせるための偽sheet名/candidate IDを作らず、4項目stateを直接投影する `createJevWorksheetReviewRouteEvaluationProvider` を使います。production providerと評価providerのJev request全体が同じになるparity testを置き、評価だけ別criteriaになることを防ぎます。


### Predeclared evaluation plan

issue-0176では、provider evaluation条件を実行前に固定する `WorksheetReviewRouteEvaluationPlanV1` を追加します。

planは0172 packetDigest、0171 readiness policy、canonical provider descriptorをSHA-256のplanDigestへbindingします。runtime providerやprojection stateがplanと異なる場合はprovider call前にfail-closedし、readinessが失われた場合はprovider call 0でblockedになります。

expected route自体はplanDigestに入れません。provider-visible stateが同じでreadinessを維持するlabel correctionならprovider inferenceを再実行せず、label versionは0172 reportのgroundTruthDigestで別管理します。


### Immutable evaluation record

issue-0177では、完了したprovider evaluationを `WorksheetReviewRouteEvaluationRecordV1` として固定します。

recordには0176 plan、provider-visibleな0172 evaluation packet、provider response、evaluation reportをsnapshotし、planDigest / packetDigest / groundTruthDigest / recordDigestを分離して保持します。packet/state・outcome observation・provider identity・report metricsをcanonical再計算で照合するため、単にrecordDigestを再計算しただけの意味論改ざんは受理しません。

human ground truthだけが訂正され、0171 readinessとprovider-visible packetが変わらない場合はstored responseをofflineで再評価できます。providerは再実行せず、planDigest / packetDigest / responseは不変、groundTruthDigest / metrics / recordDigestだけが更新されます。


### Canonical evaluation-record JSON codec

issue-0179では、issue-0177 recordをstorage非依存のcanonical JSON artifactへ変換する `WorksheetReviewRouteEvaluationRecordJsonCodecV1` を追加します。

canonical serializerはissue-0177 validatorを先に通し、object keyをrecursive sort、array orderを保持、whitespace/trailing newlineなしのJSON textを返します。normalizing parseはmanual/migration用途として非canonical formattingを許容しますが、canonical parseはinput textと再serialization結果の完全一致を要求するため、pretty JSON、key-order違い、trailing newline、duplicate-key inputをcanonical artifactとして受理しません。

artifact descriptorはmedia type、recordDigest full hex由来のstable filename、canonical contentだけを返し、filesystem/database/cloud writeやsignatureは行いません。


### Structured-artifact neutral worksheet adapter

issue-0180: research-only `WorksheetFormatSnapshot -> structured-artifact neutral observation v0` adapter。

`createMmiWorksheetStructuredArtifactObservation` は、MMIの既存snapshotから実際に観測できる
non-empty bounding geometry / non-empty ratio / merge count / header-candidate signalだけをneutral v0へ射影します。

hidden row/column visibilityはWorksheetFormatSnapshotに保持されていないため、excel-houganshi-normalizerのvisible-only methodとは別method IDを使用します。差異はH2 divergence evidenceとして保持し、数値を無理に同一意味へ正規化しません。

このadapterはresearch-onlyであり、MMI Notation、Format Profile、Fly matcher、review-route、Authority Planeのruntime contractを変更しません。
