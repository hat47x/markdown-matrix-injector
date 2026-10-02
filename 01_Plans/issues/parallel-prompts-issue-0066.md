# issue-0066 並列実行用プロンプト（最大8ストリーム）

## 分割方針サマリ
- 目的: Phase 9の初期実装を、編集ファイルの衝突なしで最大8並列へ分割する。
- 方式: 共通ファイル（`README.md`, `requirements.md`, `issue-0066`）は本ラウンドで編集しない。最終統合は別ラウンドで実施する。
- 独立性根拠: 各ストリームは専用ファイルを編集し、単独で検証コマンドを実行可能。

#### [Stream A: Phase 9 運用ガイド本文]
Role: MMI実行エージェント  
対象ファイル: `04_Documentation/phase9-rule-table-template-operations.md` (指定外ファイル編集厳禁)
タスクリストは次のとおりです。
- Task 1: issue-0066の受入条件からガイド要件を固定
- Task 2: テンプレート作成・更新・同期・監査の手順を記述
- Task 3: quality gate（可読性/検証性/追跡性）判定表を記述
- Task 4: CLI検証
- Task 5: 結果要約
指示: 自律実行プロトコルに従い直列実行。  
検証コマンド: `python3 01_Plans/tools/planning_queue.py`  
完了条件: Phase 9ガイド単体でテンプレート運用手順を再現できる。

#### [Stream B: docs 用 benchmark CSV]
Role: MMI実行エージェント  
対象ファイル: `04_Documentation/samples/phase9-rule-table-benchmark-pack.csv` (指定外ファイル編集厳禁)
タスクリストは次のとおりです。
- Task 1: 4種ベンチマーク表の列定義を固定
- Task 2: サンプル行を作成
- Task 3: ヘッダ/列順/トレース列を確認
- Task 4: CLI検証
- Task 5: 結果要約
指示: 自律実行プロトコルに従い直列実行。  
検証コマンド: `python3 01_Plans/tools/planning_queue.py`  
完了条件: docsサンプルとして説明可能なCSVが作成される。

#### [Stream C: test fixture 用 benchmark CSV]
Role: MMI実行エージェント  
対象ファイル: `03_Implement/test/fixtures/workspace/data/phase9-rule-table-benchmark-pack.csv` (指定外ファイル編集厳禁)
タスクリストは次のとおりです。
- Task 1: Stream Bと同一列定義でfixtureを作成
- Task 2: fixture用の最小再現行を追加
- Task 3: CSV整合性を確認
- Task 4: CLI検証
- Task 5: 結果要約
指示: 自律実行プロトコルに従い直列実行。  
検証コマンド: `cd 03_Implement && npm test`  
完了条件: docs/test fixtureの列定義一致が保証される。

#### [Stream D: query 観測テスト追加]
Role: MMI実行エージェント  
対象ファイル: `03_Implement/test/markdownMatrixPlugin.test.ts` (指定外ファイル編集厳禁)
タスクリストは次のとおりです。
- Task 1: phase9 benchmarkを想定したテストケースを追加
- Task 2: columns/grep/headerの観測可能性をassertion化
- Task 3: 既存テストとの衝突回避
- Task 4: CLI検証
- Task 5: 結果要約
指示: 自律実行プロトコルに従い直列実行。  
検証コマンド: `cd 03_Implement && npm test`  
完了条件: phase9 benchmark形状に対するクエリ観測テストが通る。

#### [Stream E: phase9 xlsx generator]
Role: MMI実行エージェント  
対象ファイル: `04_Documentation/samples/generate_phase9_rule_table_benchmark_xlsx.py` (指定外ファイル編集厳禁)
タスクリストは次のとおりです。
- Task 1: CSV定義からxlsx変換スクリプトを実装
- Task 2: 生成物列順・シート名を固定
- Task 3: 実行手順コメントを記述
- Task 4: CLI検証
- Task 5: 結果要約
指示: 自律実行プロトコルに従い直列実行。  
検証コマンド: `python3 04_Documentation/samples/generate_phase9_rule_table_benchmark_xlsx.py --help`  
完了条件: xlsx生成を再現可能にする。

#### [Stream F: ドキュメント-フィクスチャ同期監査スクリプト]
Role: MMI実行エージェント  
対象ファイル: `01_Plans/tools/check_phase9_template_sync.py` (指定外ファイル編集厳禁)
タスクリストは次のとおりです。
- Task 1: docs CSVとfixture CSVのヘッダ一致確認ロジックを実装
- Task 2: 差分時に終了コード1で失敗させる
- Task 3: 成功/失敗メッセージを整備
- Task 4: CLI検証
- Task 5: 結果要約
指示: 自律実行プロトコルに従い直列実行。  
検証コマンド: `python3 01_Plans/tools/check_phase9_template_sync.py`  
完了条件: 同期品質をCLIで判定できる。

#### [Stream G: 同期監査スクリプトの単体テスト]
Role: MMI実行エージェント  
対象ファイル: `01_Plans/tools/test_check_phase9_template_sync.py` (指定外ファイル編集厳禁)
タスクリストは次のとおりです。
- Task 1: 正常系（ヘッダ一致）のテストを作成
- Task 2: 異常系（ヘッダ不一致）のテストを作成
- Task 3: 終了コード/メッセージを検証
- Task 4: CLI検証
- Task 5: 結果要約
指示: 自律実行プロトコルに従い直列実行。  
検証コマンド: `python3 01_Plans/tools/test_check_phase9_template_sync.py`  
完了条件: 同期監査スクリプトの回帰が自動検知される。

#### [Stream H: 統合更新（単独ラウンド）]
Role: MMI実行エージェント  
対象ファイル: `04_Documentation/README.md`, `01_Plans/issues/issue-0066-phase9-rule-table-template-foundation.md` (指定外ファイル編集厳禁)
タスクリストは次のとおりです。
- Task 1: A〜Gの成果導線をREADMEに統合
- Task 2: issue-0066の受入条件・Validation evidenceを更新
- Task 3: planning_queueでpending/orphanを再確認
- Task 4: CLI検証
- Task 5: 結果要約
指示: 自律実行プロトコルに従い直列実行。他Stream完了後にのみ実行。  
検証コマンド: `python3 01_Plans/tools/planning_queue.py`  
完了条件: Phase 9初回イテレーションの成果が運用導線へ統合される。
