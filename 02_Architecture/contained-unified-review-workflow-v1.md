# Contained Unified Review Workflow v1

## 1. 目的

同一のstable Worksheet snapshot（読み取り前後の参照元同一性を確認したワークシートの一時データ）を、Perception（認知による候補抽出）とdeterministic review（決定論的な規則による確認）の両方へ、workflow（処理の流れ）の内部で渡す。

```text
contained source
   |
   | stable read window (issue-0153)
   v
Worksheet snapshot (transient, one read)
   |                         |
   |                         +--> issue-0157 deterministic analysis
   v
Fly Perception
   |
optional Judgment factory
   |
Cognitive Review Envelope
   |
issue-0159 proposal/deterministic workflow
   |
UnifiedHumanReviewViewModelV1
```

snapshotはworkflow内部だけで使う一時値であり、返却artifact（処理結果）には含めない。

## 2. Fixed source profile

このworkflowは現行の `SHEETJS_CE_XLSX_0203_SOURCE_PROFILE`（参照元の書式特徴を定義したプロファイル）に固定する。

理由は次のとおりです。

- issue-0157 Profile-backed analysisも同profileをprimary pathとして使用する。
- callerがPerceptionだけ別source profileへ切り替える不整合を防ぐ。
- evidence kind / feature versionの対応を単一contractに保つ。

## 3. Profile preflight

source read（参照元の読み取り）の前に、すべてのProfileを `formatProfileToWorksheetPrototype`（書式プロファイルを照合用のprototypeに変換する処理）へ通す。

candidate状態のProfile、互換性のないfeature version（特徴定義の版）、source profile（参照元プロファイル）の不一致は、I/O（ファイル入出力）の前にfail-closed（安全側として拒否）する。

## 4. Stable read

issue-0153の `createContainedCognitiveObservation`（参照元の同一性を確認して観測を生成する処理）を利用する。

snapshot reader（ワークシートの一時データを読み取る処理）は、contained absolute path（許可範囲内にあることを確認した絶対パス）だけを受け取る。

read（読み取り）の前後でsource identity（参照元の同一性）が変わった場合は、次の処理を行わない。

- Observationを返さない
- Perceptionを返さない
- Judgmentを呼ばない
- Authority loaderを呼ばない

## 5. One transient snapshot

snapshot readerは1回だけ実行する。

同じsnapshot object（同一のデータオブジェクト）を次の2つの処理で使う。

- fill-aware matcher
- Profile-backed deterministic analysis

へ使う。

上位caller（呼び出し側）にはsnapshotを返さず、Perception後に別のsnapshotへ差し替えるAPI（呼び出し口）も作らない。

## 6. Optional Judgment

optional（任意）の `judgmentFactory`（Judgment結果の生成関数）は、次の情報だけを受け取る。

- Cognitive Observation
- Fly Perception outcome

次の情報は受け取らない。

- raw worksheet snapshot
- cells
- features
- resolved absolute path
- source bytes

factoryの結果は、`createCognitiveReviewEnvelope`（認知レビュー情報を束ねる処理）にある既存のJudgment validation（判断結果の検証）へ渡す。

## 7. Authority

Authority（決定論的な確認を担う側）は、issue-0159からissue-0150/0149へ続く既存loader path（読み込み経路）を利用する。

snapshot readとAuthority Workbook load（AuthorityによるWorkbookの読み込み）は、目的が異なる。

- snapshot read: Cognitive/Deterministic observation
- Workbook load: executable proposal preview validation

Authority側ではsource digest（参照元の内容を照合する値）を再確認し、load中の変更も既存のTOCTOU check（確認時点と使用時点のずれの検査）で検出し、blocked（処理を認めない状態）にする。

## 8. Failure ordering

```text
Profile preflight
 -> source containment / stable snapshot read
 -> Perception
 -> optional Judgment
 -> Envelope
 -> deterministic evidence binding
 -> Authority Workbook load
 -> final projection
```

上流で不整合が判明した場合は、不要な後続I/Oを実行しない。

## 9. 非責務

- source write
- snapshot persistence
- Judgment provider実装
- provider network policy
- UI rendering
- automatic approval
- apply authority
- overall verdict
- matcher tuning
