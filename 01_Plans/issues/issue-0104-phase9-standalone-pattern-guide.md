# Issue: Phase 9 表パターンガイドの独立公開 (ADR-0012 D7 / ADR-0013)

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: `01_Plans/tools/generate_phase9_pattern_guide.py`（新規）, `test_generate_phase9_pattern_guide.py`（新規）,
  `04_Documentation/samples/phase9-rule-table-pattern-guide.md`（新規・生成物）,
  `04_Documentation/samples/README.md`, `04_Documentation/README.md`, `04_Documentation/phase8-drools-inspired-table-patterns.md`,
  `04_Documentation/phase9-rule-table-template-operations.md`, `03_Implement/package.json`, `README.md`（root）,
  `01_Plans/adr/ADR-0012-*.md`（トレーサビリティ追記のみ）
- Expected verification level: unit（python unittest）+ npm test（新規 test:phase9-guide-sync 含む）+ 既存 sync gate 無変更確認

## Traceability
- Related Backlog/Phase: requirements.md Phase 12（規約仕様化と普及基盤、資産独立公開）
- Related ADR/Spec: `01_Plans/adr/ADR-0012-mission-redefinition-notation-as-governance-boundary.md` D7,
  `01_Plans/adr/ADR-0013-phase9-pattern-guide-independent-publication.md`（本 issue の実行決定）
- Depends on: なし（ADR-0013 Accepted 済み）

## 背景
ADR-0012 D7 は、将来ドキュメントが正本から都度 AI 生成される世界でも残る資産として「表パターン資産（Phase 9）」を
名指しし、独立公開への投資を決定した。ADR-0013 はその実現方式を、既存の安定契約（docs/fixture CSV 同期・
release gate G3・`markdownMatrixPlugin.test.ts`）を一切変更しない**純粋加算**の生成ガイドとして決定した。

## Execution Plan
### Proposed solution（実施済み）
1. `01_Plans/tools/generate_phase9_pattern_guide.py` を新設。docs 用 CSV を唯一の入力とし、MMI 拡張を
   インストールせずに読める標準 Markdown ガイドを生成する。`QueryExample` は各表末尾の「任意」コールアウトに
   隔離し、`RelatedTest`（MMI 内部の回帰テストポインタ）は一切出力しない。未知の `BenchmarkTable` 値は
   非ゼロ終了で明示的に失敗する。`--check` で既存ガイドとの差分検知（無書き込み）を提供する。
2. `test_generate_phase9_pattern_guide.py`: グルーピング順序・QueryExample/RelatedTest の扱い・
   `--check` の成功/失敗・冪等性・未知テーブルでの失敗をカバーする9テストを追加。
3. `04_Documentation/samples/phase9-rule-table-pattern-guide.md` を実データから生成・コミット。
4. `03_Implement/package.json` に `test:phase9-guide-sync` を追加し `test` チェーンへ組込。
5. `samples/README.md` / `04_Documentation/README.md` / `phase8-drools-inspired-table-patterns.md`（バナー）/
   `phase9-rule-table-template-operations.md`（3点 round-trip 追記）/ root `README.md`（1行）/
   ADR-0012 トレーサビリティを更新。

### 実装中に発見した既存データ品質の欠陥（本 issue のスコープ外・記録のみ）
- `phase9-rule-table-benchmark-pack.csv` の `QueryExample` 列は値そのものにカンマを含むが CSV クォートされて
  おらず、標準 `csv.DictReader`（`check_phase9_template_sync.py` が使用）では以降の列がずれる。
  `markdownMatrixPlugin.test.ts` の独自パーサが同じ問題を固定位置復元で回避しており、本 issue の生成器も
  同じ手法を採用した。是正は別 issue へ（詳細は ADR-0013 Follow-up Actions）。

### Acceptance criteria
- [x] `phase9-rule-table-pattern-guide.md` が MMI 非依存で意味の通る内容として読める
      （QueryExample は「任意」コールアウトのみ、主テーブルは10列で完結）。
- [x] `RelatedTest` はガイドのどこにも出現しない。
- [x] `--check` が差分検知・無書き込みで機能し、デフォルトモードは冪等（2回連続実行でバイト同一）。
- [x] 未知 `BenchmarkTable` 値で非ゼロ終了する。
- [x] `check_phase9_template_sync.py` / `markdownMatrixPlugin.test.ts` / docs・fixture CSV /
      `release_gate_check.py`（G3）が本 issue のコミットで一切変更されていない。
- [x] `03_Implement/package.json` の `test` チェーンに `test:phase9-guide-sync` が追加され、
      既存 `test:unit` / `test:phase9-sync` の本体は無変更。
- [x] `samples/README.md` のサンプル一覧に Phase 8/9 CSV とガイドの3ファイルが追加されている。
- [x] `phase8-drools-inspired-table-patterns.md` に「ケーススタディである」旨のバナーと新ガイドへの
      クロスリンクが追加されている。
- [x] root README に新ガイドへのリンクが1行追加されている（生CSV・Phase8資産・運用文書への直接リンクは追加しない）。
- [x] `python3 01_Plans/tools/planning_queue.py` で orphan issue が 0 件。

### Validation plan（実績）
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
