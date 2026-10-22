# Issue: Worksheet書式スナップショットから照合用特徴を抽出する純粋adapter

この文書は当時のIssue記録です。2026年9月12日のローカル検証では6件のunit testが成功したと記録されています。純粋adapterはWorkbook I/Oや製品経路へ接続せず、基準prototypeを同じadapterで生成するという判断を保持します。

## Meta
- Type: Feature
- Status: Done
- Priority: Medium
- Scope: `03_Implement/src/experimental/worksheetFormatFeatureAdapter.ts`, `03_Implement/test/worksheetFormatFeatureAdapter.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: requirements.md Phase 1 / Phase 5 / Phase 11
- Related ADR/Spec: ADR-0017-fly-inspired-format-deviation-assistance.md
- Dependency: issue-0114 Done, issue-0115 Done

## 当時の実行計画
### 解決方針（当時の提案）

実Excel readerへ直接heuristicを埋め込まず、まずセル位置・文字列・粗いstyle分類・結合範囲だけを受け取る`WorksheetFormatSnapshot`を定義する。純粋adapterがそこからmatcher用の特徴トークンを生成する。

初期特徴は、表として再現性が高く説明可能なものに限定する。

- header候補行: 非空セル数、fill、borderの観測量から決定論的に採点
- `region:title-row`: headerより前の横方向mergeを伴うタイトル行
- `header:<tone>-fill`: headerの支配的fill分類
- `column:<label>`: headerセル文字列
- `border:<kind>`: 表内の支配的border分類
- `layout:<n>-columns`: headerの列スパン

adapterは観測した列ラベルを恣意的に間引かない。prototypeは同一adapterの基準snapshot出力から生成する。識別特徴だけを抜粋した評価fixtureとの直接比較は別のfeature-selection規約が必要なため本Issueでは行わない。

このadapter自体はWorkbook I/O、SheetJS、VS Code、正本ファイルへ依存しない。次IssueでSheetJSの`cellStyles: true`、`!merges`、`!rows`、`!cols`からsnapshotを構築するbridgeを検証する。

### 受入条件（Acceptance criteria）
- [x] タイトル行+6列headerを持つsnapshotから、title/fill/列名/border/layoutの主要特徴を抽出できる。
- [x] headerより前に2列程度のメタデータ行があっても、style付き6列headerをheaderとして選ぶ。
- [x] header fillの軽微な差異を`dark`/`gray`等の分類として保持し、勝手に既知fillへ補正しない。
- [x] 同じadapterから作った基準prototypeに対し、軽微なfill driftが候補として残る。
- [x] セル入力順に依存せず同じ特徴列を返す。
- [x] 非表形式でheader候補が成立しない場合は空特徴で停止する。
- [x] 重複座標や不正な行列番号は明示エラーにし、曖昧なsnapshotを自動修復しない。
- [x] 既存製品経路・Workbook I/Oへ接続しない。
- [x] ローカルstrict TypeScript検証とunit testが成功する。

### 作業項目（Task breakdown）
- [x] snapshot型とheader scoringを実装する。
- [x] title/header/column/border/layout特徴抽出を実装する。
- [x] adapter単体およびmatcher接続のunit testを追加する。
- [x] ローカル型検査・unit testを実施する。

### 当時の検証計画（Validation plan）

GitHub Actionsはリソース不足のため完了条件に含めない。対象差分をstrict TypeScript条件でコンパイルし、unit testをNode test runnerで実行する。

## Validation evidence

### 2026-09-12 local validation

- Node.js `v22.16.0` / TypeScript `5.8.3`。
- `flyInspiredFormatMatcher.ts`、`worksheetFormatFeatureAdapter.ts`、実際のadapter testを `--strict --target ES2022 --module NodeNext --moduleResolution NodeNext` で型検査・コンパイルし成功。
- bare環境に`@types/node`がないため、`node:test` / `node:assert/strict`だけ最小shimを使用。製品リポジトリには`@types/node` devDependencyが存在する。
- コンパイル後のunit test: **6 tests / 6 pass / 0 fail**。

### 検証中に確定した設計判断

最初のテストでは、adapterが全header列を正しく観測する一方、issue-0115の手書き評価prototypeが識別列だけを持つため、追加された正しい特徴がJaccard分母を増やして`novel`になることを検出した。

この結果から、実Workbook向けprototypeは**同じadapterを基準snapshotへ適用した完全観測から生成する**ことを本Issueで固定した。adapter側で都合よく列を捨てたり、matcher閾値を緩めたりはしない。識別特徴の選択・重み付けを導入する場合は別Issueで明示的に設計する。

次段階では、SheetJSのread-only worksheet表現を`WorksheetFormatSnapshot`へ変換するbridgeを実装する。
