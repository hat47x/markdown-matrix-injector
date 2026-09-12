# Issue: Worksheet書式snapshotからmatcher特徴を抽出する純粋adapter

## Meta
- Type: Feature
- Status: In Progress
- Priority: Medium
- Scope: `03_Implement/src/experimental/worksheetFormatFeatureAdapter.ts`, `03_Implement/test/worksheetFormatFeatureAdapter.test.ts`
- Expected verification level: unit

## Traceability
- Related Backlog/Phase: requirements.md Phase 1 / Phase 5 / Phase 11
- Related ADR/Spec: ADR-0017-fly-inspired-format-deviation-assistance.md
- Dependency: issue-0114 Done, issue-0115 Done

## Execution Plan
### Proposed solution

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

### Acceptance criteria
- [ ] タイトル行+6列headerを持つsnapshotから、title/fill/列名/border/layoutの主要特徴を抽出できる。
- [ ] headerより前に2列程度のメタデータ行があっても、style付き6列headerをheaderとして選ぶ。
- [ ] header fillの軽微な差異を`dark`/`gray`等の分類として保持し、勝手に既知fillへ補正しない。
- [ ] 同じadapterから作った基準prototypeに対し、軽微なfill driftが候補として残る。
- [ ] セル入力順に依存せず同じ特徴列を返す。
- [ ] 非表形式でheader候補が成立しない場合は空特徴で停止する。
- [ ] 重複座標や不正な行列番号は明示エラーにし、曖昧なsnapshotを自動修復しない。
- [ ] 既存製品経路・Workbook I/Oへ接続しない。
- [ ] ローカルstrict TypeScript検証とunit testが成功する。

### Task breakdown
- [x] snapshot型とheader scoringを実装する。
- [x] title/header/column/border/layout特徴抽出を実装する。
- [x] adapter単体およびmatcher接続のunit testを追加する。
- [ ] ローカル型検査・unit testを実施する。

### Validation plan

GitHub Actionsはリソース不足のため完了条件に含めない。対象差分をstrict TypeScript条件でコンパイルし、unit testをNode test runnerで実行する。
