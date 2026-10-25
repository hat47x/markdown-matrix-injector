# ADR-0013: Phase 9 表パターン資産の独立公開 (Standalone Pattern Guide)

- Status: Accepted
- Date: 2026-07-09
- Deciders: MMI Lead Agent
- Consulted: Architecture Lead, Product/UX Lead, QA/Delivery Lead
- Informed: Documentation / Implementation maintainers
- Scope: Phase 9ベンチマークテンプレートをMMI非依存で読める形にする追加公開物、Phase 8資産のスコープ確認、release gateへの影響範囲

## Context (背景と課題)
- ADR-0012 D7は「将来ドキュメントが正本から都度AI生成される世界でも残る資産」として、構造化された正本・参照規約に加え
  「表パターン資産（Phase 9）」を名指しし、拡張機能UIの磨き込みより仕様/資産の一般化・独立公開に投資すべきと決定した。
- 現状のPhase 9資産（`04_Documentation/samples/phase9-rule-table-benchmark-pack.csv`）は、要件トレーサビリティ・
  状態遷移・障害切り分け・リリース判定の4パターンを収録し、`QueryExample` 列にMMIクエリ例を持つ。しかし
  このCSV単体を読む読者（VS CodeやMMI拡張を持たない読者）向けの「生のCSVをそのまま開く」以外の入口がなく、
  `04_Documentation/samples/README.md` のサンプル一覧からも欠落している（未索引）。
- Phase 8資産（`phase8-drools-inspired-system-design-patterns.csv`）はMMI自身の機能（印刷制御・Smart Fallback・
  queryフィルタ等）を題材にしたケーススタディであり、ADR-0012 D7が名指ししたのはPhase 9のみである。Phase 8を
  無理に「汎用テンプレート」として扱うと、実態（MMI内部機能の解説）と乖離した誇大な主張になる。
- `check_phase9_template_sync.py`（docs/fixture CSVの同期監査、ADR-0007/ADR-0008で規定）はrelease gate G3の
  安定契約であり、本ADRはこれを変更・拡張しない。

## Decision (決定事項)
1. **追加専用の生成ガイドを新設する**。既存のdocs用CSV（`phase9-rule-table-benchmark-pack.csv`）を唯一の入力とし、
   `03_Implement/tools/generate_phase9_pattern_guide.py` が `04_Documentation/samples/phase9-rule-table-pattern-guide.md`
   を機械的に生成する。ガイドはMMI拡張機能を一切インストールせずに読める汎用Markdownとし、`QueryExample` は
   各表ごとに明示的な「任意: MMIで問い合わせる」コールアウト内にのみ収め、`RelatedTest`（MMI内部の回帰テスト
   ポインタで一般読者に無価値）はガイドに一切出力しない。
2. **docs/fixture CSV・sync checker・release gate G3・既存unitは一切変更しない**（本決定は純粋加算）。
   `check_phase9_template_sync.py` の `REQUIRED_COLUMNS` / デフォルトパス / CLI / JSONスキーマ
   （`phase9-sync-v1`）、`markdownMatrixPlugin.test.ts` の既存アサーション、`release_gate_check.py` のG3は
   本ADRの対象外であり、コミット差分に含めない。
3. **Phase 8は「汎用テンプレート」の主張対象から明示的に除外する**。`phase8-drools-inspired-table-patterns.md`
   冒頭に「MMI自身の内部機能を題材にしたケーススタディである」旨のバナーと、新ガイドへのクロスリンクを追加する。
   Phase 8のCSV/fixture同期は既存どおり（プローズのみの未強制な約束のまま）とし、本issueの対象に含めない。
4. **ドリフト検知は `--check` モードで自衛するが、release gateへの統合（G4相当）は本ADRの対象外とし別issueへ
   委譲する**。ADR-0007 → ADR-0008が同一資産に対して行った「まず作る → 後でquality gateを強化する」の二段階
   先例に倣う。
5. **発見可能性**: リポジトリルートREADMEに新ガイドへのリンクを1行追加する（生CSV・Phase 8資産・運用文書への
   直接リンクは追加しない — ガイド自身のフッターから辿れるようにし、ルートの参照は最小限に保つ）。
   `04_Documentation/samples/README.md` のサンプル一覧に、これまで欠落していたPhase 8/Phase 9のCSVとガイドの
   3ファイルを追加する。

## Consequences (結果と影響)
- **Good:** VS Code 拡張を導入していない読者にも、Phase 9 の表パターンが即座に価値を持つ形で届く（ADR-0012 D7 充足）。
- **Good:** 既存の同期ゲート・テスト・release gate は一切変更されないため、この変更の副作用範囲はゼロに近い。
- **Good:** Phase 8 の位置付けが実態に即して正直になる（誇大主張の回避）。
- **Bad:** ガイド生成器の `BENCHMARK_TABLE_DESCRIPTIONS` は CSV とは別に手動保守が必要なプローズであり、新しい
  `BenchmarkTable` 値を追加する際は生成器辞書の更新も同時に必要になる（`--check` が失念を検知する）。
- **Bad:** release gate に統合されるまでは、`npm test` を実行しない変更ではガイドの陳腐化を検知できない
  （windowが生じる）。フォローアップissueで解消する。
- **Trade-off 受容理由:** 既存の安定契約（sync checker・release gate G3）を壊すリスクを取るより、追加専用の
  新規生成物として独立させる方が、ADR-0007/ADR-0008の資産投資を毀損せず前進できる。

## Follow-up Actions
- release gateへの `--check` 統合（G4相当）を別issueで検討する。
  **【2026-07-15追記・解消済み】** `release_gate_check.py` に `G4:Phase9GuideSync` ゲートとして統合済み
  （`evaluate_phase9_guide_sync_gate`、`--skip-tests` 時はスキップ扱い、`test_release_gate_check.py` 26件
  で検証、`--allow-pending-issues` 実行で実際にPASSを確認）。
- Phase 8 CSV/fixtureの同期強制化（Phase 9相当のquality gate）が必要になった場合は、別ADRで検討する
  （本ADRのスコープではない）。
- **新規発見（本issue実装中に判明、要フォローアップ）**: `phase9-rule-table-benchmark-pack.csv` の
  `QueryExample` 列は、値そのものにカンマを含む（例: `header=first&columns=A,B,C,J,K`）にもかかわらず
  CSVクォート（`"..."`）されていない。標準RFC4180パーサ（`csv.DictReader`。`check_phase9_template_sync.py`
  も同じ手段を用いる）で読むと、`QueryExample` 以降の全列（`RelatedRequirement` / `RelatedTest` / `Owner` /
  `Notes`）がずれて誤った値になる。`03_Implement/test/markdownMatrixPlugin.test.ts` の
  `loadPhase9BenchmarkRows` は「前8列＋可変長QueryExample＋後4列」という固定位置復元でこれを回避しており、
  本ADRの生成器（`generate_phase9_pattern_guide.py`）も同じ手法を採用した。docs/fixtureの内容比較・必須列
  非空チェックという既存sync gateの検証範囲では、値がずれていても「非空文字列」である限り検知されないため、
  Phase 9資産の運用開始以来これは気づかれていなかった。是正（`QueryExample` 値を適切にCSVクォートし、
  対応するTypeScriptテストの手動パーサを標準CSVパーサへ置換する）は、docs/fixture両CSV・
  `markdownMatrixPlugin.test.ts`・`check_phase9_template_sync.py` すべてに影響するため、本ADRの
  「純粋加算」スコープには含めず、別issueで扱う。
  **【2026-07-15追記】** issue-0105の検証中、この根本原因はPhase 9 CSV固有ではなく **MMI本体の
  CSVローダー `src/core/workbookLoader.ts` の `parseCsv()` がRFC4180クォートを一切未対応**という、
  より広範な製品コア機能の欠陥であると判明した（あらゆる利用者の実データCSVに影響し得る）。
  こちらは `issue-0106` として切り出し、パーサー自体を是正した。
  **【同日追記2】** パーサー修正後に実データで検証したところ、本CSVを実際に埋め込むとヘッダ13列に
  対しデータ行17列に破損する実害を確認したため、コアパーサーが正しくなったことで安全に是正できる
  ようになったデータ側のクォート付与（docs/fixture CSV・`markdownMatrixPlugin.test.ts` の独自パーサー
  撤去・`generate_phase9_pattern_guide.py` の簡素化）もissue-0106内で同日中に完了させた。
  `check_phase9_template_sync.py` は無変更のまま `OK`。本Follow-up項目は解消済み。

## Traceability (関連情報)
- Related requirements: `00_Prompt/requirements.md` Phase 9 / Phase 12（規約仕様化と普及基盤、資産独立公開）
- Related ADR: `ADR-0007-phase9-rule-table-interoperability-and-design-assetization.md`（本ADRが拡張するストリーム4）,
  `ADR-0008-phase9-template-sync-quality-gate-hardening.md`（同種の二段階強化の先例）,
  `ADR-0012-mission-redefinition-notation-as-governance-boundary.md`（D7の決定根拠）
- Related issue: `issue-0104-phase9-standalone-pattern-guide.md`
- Unaffected contracts (verified untouched): `03_Implement/tools/check_phase9_template_sync.py`,
  `03_Implement/test/markdownMatrixPlugin.test.ts`, `03_Implement/tools/release_gate_check.py`（G3）

## 議事録 (AI読込不要)
### Issue Definition
- ADR-0012 D7の「表パターン資産の独立公開」を、既存の安定契約（sync checker・release gate G3）を壊さずにどう実現するか。

### Virtual Debate
- Architecture Lead: 既存CSV・sync checker・G3はPhase 9で確立した安定契約。ここに手を入れるのはリスクに対して
  得るものが少ない。純粋加算（新規生成ファイル）のみで完結させるべき。
- Product/UX Lead: 「独立公開」の本質は、読者がMMIを知らなくても価値を得られること。QueryExampleを主テーブルから
  外し「任意」ラベルを付けることで、汎用性とMMI訴求を両立できる。Phase 8を無理に汎用と偽るのは信頼を損なう。
- QA/Delivery Lead: ドリフト防止は必須だが、release gate統合まで一度に背負うと変更が重くなる。`--check` の
  自己検証までを本issueのスコープとし、gate統合はADR-0007→ADR-0008の前例どおり別issueに切り出す。

### Synthesis & Decision
- 3ロール合意: 純粋加算の生成ガイド + Phase 8の正直な再スコープ + release gate統合の意図的な先送り、という
  構成でADR-0012 D7を充足する。
- 要件根幹の変更ではなくPhase 12の実行計画の具体化であるため、ADR + issue起票で実行可能（人間承認待ち不要）。
