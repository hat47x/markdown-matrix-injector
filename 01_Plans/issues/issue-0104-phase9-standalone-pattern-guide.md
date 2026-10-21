# Issue: Phase 9表パターンガイドの独立公開と同期検証

この文書は当時のIssue記録です。MMI拡張なしで読める表パターンガイドを生成する当時の方針と実績です。既存CSVの品質上の欠陥はスコープ外として記録されたまま保持し、修正済みとは扱いません。

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: `01_Plans/tools/generate_phase9_pattern_guide.py`（新規）, `test_generate_phase9_pattern_guide.py`（新規）,
  `04_Documentation/samples/phase9-rule-table-pattern-guide.md`（新規・生成物）,
  `04_Documentation/samples/README.md`, `04_Documentation/README.md`, `04_Documentation/phase8-drools-inspired-table-patterns.md`,
  `04_Documentation/phase9-rule-table-template-operations.md`, `03_Implement/package.json`, `README.md`（root）,
  `01_Plans/adr/ADR-0012-*.md`（トレーサビリティ追記のみ）
- Expected verification level: unit（python unittest）+ npm test（新規test:phase9-guide-sync含む）+ 既存sync gate無変更確認

## Traceability
- Related Backlog/Phase: requirements.md Phase 12（規約仕様化と普及基盤、資産独立公開）
- Related ADR/Spec: `01_Plans/adr/ADR-0012-mission-redefinition-notation-as-governance-boundary.md` D7,
  `01_Plans/adr/ADR-0013-phase9-pattern-guide-independent-publication.md`（本issueの実行決定）
- Depends on: なし（ADR-0013 Accepted済み）

## 背景
ADR-0012 D7は、将来ドキュメントが正本から都度AI生成される世界でも残る資産として「表パターン資産（Phase 9）」を
名指しし、独立公開への投資を決定した。ADR-0013はその実現方式を、既存の安定契約（docs/fixture CSV同期・
release gate G3・`markdownMatrixPlugin.test.ts`）を一切変更しない**純粋加算**の生成ガイドとして決定した。

## 当時の実行計画
### 解決方針（当時の提案）（実施済み）
1. `01_Plans/tools/generate_phase9_pattern_guide.py` を新設。docs用CSVを唯一の入力とし、MMI拡張を
   インストールせずに読める標準Markdownガイドを生成する。`QueryExample` は各表末尾の「任意」コールアウトに
   隔離し、`RelatedTest`（MMI内部の回帰テストポインタ）は一切出力しない。未知の `BenchmarkTable` 値は
   非ゼロ終了で明示的に失敗する。`--check` で既存ガイドとの差分検知（無書き込み）を提供する。
2. `test_generate_phase9_pattern_guide.py`: グルーピング順序・QueryExample/RelatedTestの扱い・
   `--check` の成功/失敗・冪等性・未知テーブルでの失敗をカバーする9テストを追加。
3. `04_Documentation/samples/phase9-rule-table-pattern-guide.md` を実データから生成・コミット。
4. `03_Implement/package.json` に `test:phase9-guide-sync` を追加し `test` チェーンへ組込。
5. `samples/README.md` / `04_Documentation/README.md` / `phase8-drools-inspired-table-patterns.md`（バナー）/
   `phase9-rule-table-template-operations.md`（3点round-trip追記）/ root `README.md`（1行）/
   ADR-0012トレーサビリティを更新。

### 実装中に発見した既存データ品質の欠陥（本 issue のスコープ外・記録のみ）
- `phase9-rule-table-benchmark-pack.csv` の `QueryExample` 列は値そのものにカンマを含むがCSVクォートされて
  おらず、標準 `csv.DictReader`（`check_phase9_template_sync.py` が使用）では以降の列がずれる。
  `markdownMatrixPlugin.test.ts` の独自パーサが同じ問題を固定位置復元で回避しており、本issueの生成器も
  同じ手法を採用した。是正は別issueへ（詳細はADR-0013 Follow-up Actions）。

### 受入条件（Acceptance criteria）
- [x] `phase9-rule-table-pattern-guide.md` がMMI非依存で意味の通る内容として読める
      （QueryExampleは「任意」コールアウトのみ、主テーブルは10列で完結）。
- [x] `RelatedTest` はガイドのどこにも出現しない。
- [x] `--check` が差分検知・無書き込みで機能し、デフォルトモードは冪等（2回連続実行でバイト同一）。
- [x] 未知 `BenchmarkTable` 値で非ゼロ終了する。
- [x] `check_phase9_template_sync.py` / `markdownMatrixPlugin.test.ts` / docs・fixture CSV /
      `release_gate_check.py`（G3）が本issueのコミットで一切変更されていない。
- [x] `03_Implement/package.json` の `test` チェーンに `test:phase9-guide-sync` が追加され、
      既存 `test:unit` / `test:phase9-sync` の本体は無変更。
- [x] `samples/README.md` のサンプル一覧にPhase 8/9 CSVとガイドの3ファイルが追加されている。
- [x] `phase8-drools-inspired-table-patterns.md` に「ケーススタディである」旨のバナーと新ガイドへの
      クロスリンクが追加されている。
- [x] root READMEに新ガイドへのリンクが1行追加されている（生CSV・Phase8資産・運用文書への直接リンクは追加しない）。
- [x] `python3 01_Plans/tools/planning_queue.py` でorphan issueが0件。

### 当時の検証計画（Validation plan）（実績）
```bash
cd 01_Plans/tools
python3 -m unittest test_generate_phase9_pattern_guide -v   # 9 pass
python3 generate_phase9_pattern_guide.py --check              # OK: in sync
python3 check_phase9_template_sync.py                         # OK（無変更確認）
cd ../../03_Implement
npm test                                                       # test:unit + test:phase9-sync + test:phase9-guide-sync
cd ..
python3 01_Plans/tools/planning_queue.py                       # orphan 0
git diff --stat -- 01_Plans/tools/check_phase9_template_sync.py 03_Implement/test/markdownMatrixPlugin.test.ts \
  04_Documentation/samples/phase9-rule-table-benchmark-pack.csv \
  03_Implement/test/fixtures/workspace/data/phase9-rule-table-benchmark-pack.csv \
  01_Plans/tools/release_gate_check.py                         # 出力なし（無変更を確認）
```
