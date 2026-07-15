# ADR-0013: Phase 9 表パターン資産の独立公開 (Standalone Pattern Guide)

- Status: Accepted
- Date: 2026-07-09
- Deciders: MMI Lead Agent
- Consulted: Architecture Lead, Product/UX Lead, QA/Delivery Lead
- Informed: Documentation / Implementation maintainers
- Scope: Phase 9 ベンチマークテンプレートを MMI 非依存で読める形にする追加公開物、Phase 8 資産のスコープ確認、release gate への影響範囲

## Context (背景と課題)
- ADR-0012 D7 は「将来ドキュメントが正本から都度 AI 生成される世界でも残る資産」として、構造化された正本・参照規約に加え
  「表パターン資産（Phase 9）」を名指しし、拡張機能 UI の磨き込みより仕様/資産の一般化・独立公開に投資すべきと決定した。
- 現状の Phase 9 資産（`04_Documentation/samples/phase9-rule-table-benchmark-pack.csv`）は、要件トレーサビリティ・
  状態遷移・障害切り分け・リリース判定の 4 パターンを収録し、`QueryExample` 列に MMI クエリ例を持つ。しかし
  この CSV 単体を読む読者（VS Code や MMI 拡張を持たない読者）向けの「生の CSV をそのまま開く」以外の入口がなく、
  `04_Documentation/samples/README.md` のサンプル一覧からも欠落している（未索引）。
- Phase 8 資産（`phase8-drools-inspired-system-design-patterns.csv`）は MMI 自身の機能（印刷制御・Smart Fallback・
  query フィルタ等）を題材にしたケーススタディであり、ADR-0012 D7 が名指ししたのは Phase 9 のみである。Phase 8 を
  無理に「汎用テンプレート」として扱うと、実態（MMI 内部機能の解説）と乖離した誇大な主張になる。
- `check_phase9_template_sync.py`（docs/fixture CSV の同期監査、ADR-0007/ADR-0008 で規定）は release gate G3 の
  安定契約であり、本 ADR はこれを変更・拡張しない。

## Decision (決定事項)
1. **追加専用の生成ガイドを新設する**。既存の docs 用 CSV（`phase9-rule-table-benchmark-pack.csv`）を唯一の入力とし、
   `01_Plans/tools/generate_phase9_pattern_guide.py` が `04_Documentation/samples/phase9-rule-table-pattern-guide.md`
   を機械的に生成する。ガイドは MMI 拡張機能を一切インストールせずに読める汎用 Markdown とし、`QueryExample` は
   各表ごとに明示的な「任意: MMI で問い合わせる」コールアウト内にのみ収め、`RelatedTest`（MMI 内部の回帰テスト
   ポインタで一般読者に無価値）はガイドに一切出力しない。
2. **docs/fixture CSV・sync checker・release gate G3・既存 unit は一切変更しない**（本決定は純粋加算）。
   `check_phase9_template_sync.py` の `REQUIRED_COLUMNS` / デフォルトパス / CLI / JSON スキーマ
   （`phase9-sync-v1`）、`markdownMatrixPlugin.test.ts` の既存アサーション、`release_gate_check.py` の G3 は
   本 ADR の対象外であり、コミット差分に含めない。
3. **Phase 8 は「汎用テンプレート」の主張対象から明示的に除外する**。`phase8-drools-inspired-table-patterns.md`
   冒頭に「MMI 自身の内部機能を題材にしたケーススタディである」旨のバナーと、新ガイドへのクロスリンクを追加する。
   Phase 8 の CSV/fixture 同期は既存どおり（プローズのみの未強制な約束のまま）とし、本 issue の対象に含めない。
4. **ドリフト検知は `--check` モードで自衛するが、release gate への統合（G4 相当）は本 ADR の対象外とし別 issue へ
   委譲する**。ADR-0007 → ADR-0008 が同一資産に対して行った「まず作る → 後で quality gate を強化する」の二段階
   先例に倣う。
5. **発見可能性**: リポジトリルート README に新ガイドへのリンクを 1 行追加する（生 CSV・Phase 8 資産・運用文書への
   直接リンクは追加しない — ガイド自身のフッターから辿れるようにし、ルートの参照は最小限に保つ）。
   `04_Documentation/samples/README.md` のサンプル一覧に、これまで欠落していた Phase 8/Phase 9 の CSV とガイドの
   3 ファイルを追加する。

## Consequences (結果と影響)
- **Good:** VS Code 拡張を導入していない読者にも、Phase 9 の表パターンが即座に価値を持つ形で届く（ADR-0012 D7 充足）。
- **Good:** 既存の同期ゲート・テスト・release gate は一切変更されないため、この変更の副作用範囲はゼロに近い。
- **Good:** Phase 8 の位置付けが実態に即して正直になる（誇大主張の回避）。
- **Bad:** ガイド生成器の `BENCHMARK_TABLE_DESCRIPTIONS` は CSV とは別に手動保守が必要なプローズであり、新しい
  `BenchmarkTable` 値を追加する際は生成器辞書の更新も同時に必要になる（`--check` が失念を検知する）。
- **Bad:** release gate に統合されるまでは、`npm test` を実行しない変更ではガイドの陳腐化を検知できない
  （window が生じる）。フォローアップ issue で解消する。
- **Trade-off 受容理由:** 既存の安定契約（sync checker・release gate G3）を壊すリスクを取るより、追加専用の
  新規生成物として独立させる方が、ADR-0007/ADR-0008 の資産投資を毀損せず前進できる。

## Follow-up Actions
- release gate への `--check` 統合（G4 相当）を別 issue で検討する。
- Phase 8 CSV/fixture の同期強制化（Phase 9 相当の quality gate）が必要になった場合は、別 ADR で検討する
  （本 ADR のスコープではない）。
- **新規発見（本 issue 実装中に判明、要フォローアップ）**: `phase9-rule-table-benchmark-pack.csv` の
  `QueryExample` 列は、値そのものにカンマを含む（例: `header=first&columns=A,B,C,J,K`）にもかかわらず
  CSV クォート（`"..."`）されていない。標準 RFC4180 パーサ（`csv.DictReader`。`check_phase9_template_sync.py`
  も同じ手段を用いる）で読むと、`QueryExample` 以降の全列（`RelatedRequirement` / `RelatedTest` / `Owner` /
  `Notes`）がずれて誤った値になる。`03_Implement/test/markdownMatrixPlugin.test.ts` の
  `loadPhase9BenchmarkRows` は「前8列＋可変長 QueryExample＋後4列」という固定位置復元でこれを回避しており、
  本 ADR の生成器（`generate_phase9_pattern_guide.py`）も同じ手法を採用した。docs/fixture の内容比較・必須列
  非空チェックという既存 sync gate の検証範囲では、値がずれていても「非空文字列」である限り検知されないため、
  Phase 9 資産の運用開始以来これは気づかれていなかった。是正（`QueryExample` 値を適切に CSV クォートし、
  対応する TypeScript テストの手動パーサを標準 CSV パーサへ置換する）は、docs/fixture 両 CSV・
  `markdownMatrixPlugin.test.ts`・`check_phase9_template_sync.py` すべてに影響するため、本 ADR の
  「純粋加算」スコープには含めず、別 issue で扱う。
  **【2026-07-15 追記】** issue-0105 の検証中、この根本原因は Phase 9 CSV 固有ではなく **MMI 本体の
  CSV ローダー `src/core/workbookLoader.ts` の `parseCsv()` が RFC4180 クォートを一切未対応**という、
  より広範な製品コア機能の欠陥であると判明した（あらゆる利用者の実データ CSV に影響し得る）。
  こちらは `issue-0106` として切り出し、パーサー自体は是正・実装済み（`Done`）。Phase 9 CSV データ
  そのもののクォート付与は、issue-0106 でも同様の理由でなお別 issue のまま。

## Traceability (関連情報)
- Related requirements: `00_Prompt/requirements.md` Phase 9 / Phase 12（規約仕様化と普及基盤、資産独立公開）
- Related ADR: `ADR-0007-phase9-rule-table-interoperability-and-design-assetization.md`（本 ADR が拡張するストリーム4）,
  `ADR-0008-phase9-template-sync-quality-gate-hardening.md`（同種の二段階強化の先例）,
  `ADR-0012-mission-redefinition-notation-as-governance-boundary.md`（D7 の決定根拠）
- Related issue: `issue-0104-phase9-standalone-pattern-guide.md`
- Unaffected contracts (verified untouched): `01_Plans/tools/check_phase9_template_sync.py`,
  `03_Implement/test/markdownMatrixPlugin.test.ts`, `01_Plans/tools/release_gate_check.py`（G3）

## 議事録 (AI読込不要)
### Issue Definition
- ADR-0012 D7 の「表パターン資産の独立公開」を、既存の安定契約（sync checker・release gate G3）を壊さずにどう実現するか。

### Virtual Debate
- Architecture Lead: 既存 CSV・sync checker・G3 は Phase 9 で確立した安定契約。ここに手を入れるのはリスクに対して
  得るものが少ない。純粋加算（新規生成ファイル）のみで完結させるべき。
- Product/UX Lead: 「独立公開」の本質は、読者が MMI を知らなくても価値を得られること。QueryExample を主テーブルから
  外し「任意」ラベルを付けることで、汎用性と MMI 訴求を両立できる。Phase 8 を無理に汎用と偽るのは信頼を損なう。
- QA/Delivery Lead: ドリフト防止は必須だが、release gate 統合まで一度に背負うと変更が重くなる。`--check` の
  自己検証までを本 issue のスコープとし、gate 統合は ADR-0007→ADR-0008 の前例どおり別 issue に切り出す。

### Synthesis & Decision
- 3 ロール合意: 純粋加算の生成ガイド + Phase 8 の正直な再スコープ + release gate 統合の意図的な先送り、という
  構成で ADR-0012 D7 を充足する。
- 要件根幹の変更ではなく Phase 12 の実行計画の具体化であるため、ADR + issue 起票で実行可能（人間承認待ち不要）。
