# Phase 8 運用信頼性・サポート品質ガイド

## 対象読者
- 障害一次対応を担当する Maintainer / Support 担当
- docs audit と runbook 更新を行う Documentation 担当
- 再発防止の test 戦略を管理する QA / Delivery 担当

## 前提条件
- `00_Prompt/requirements.md` に Phase 8 が定義されていること。
- `01_Plans/adr/ADR-0006-phase8-operational-reliability-and-supportability.md` が Accepted であること。
- `04_Documentation/phase7-release-readiness.md` の release gate 運用を継続していること。

## 期待結果
- 障害発生時に triage -> 再現 -> 一次回避 -> 恒久対応 までを同じ導線で実施できる。
- 文書の利便性（探しやすさ）と網羅性（再現に必要な情報量）を定点監査できる。
- サポート活動で得た知見が、文書更新だけでなく要件・設計・テスト改善へ還流される。

## 関連文書
- `00_Prompt/requirements.md`（Phase 8 要件）
- `01_Plans/adr/ADR-0006-phase8-operational-reliability-and-supportability.md`（運用方針）
- `01_Plans/issues/issue-0065-phase8-operational-reliability-foundation.md`（初回実行タスク）
- `04_Documentation/phase7-release-readiness.md`（release gate 基盤）
- `04_Documentation/phase8-drools-inspired-table-patterns.md`（Drools Excel テーブル書式を参照した設計文書・テストデータパターン集）
- `01_Plans/tools/planning_queue.py`（orphan/pending 可視化）

## 既知の制約
- 現時点では triage 自動分類は運用ルール主体であり、すべての問い合わせが自動タグ付けされるわけではない。
- 問い合わせログの粒度が不足すると、contract test への還流候補を十分に抽出できない。

---

## 1. インシデント一次対応の固定導線（最短経路）
1. `python3 01_Plans/tools/planning_queue.py` を実行し、関連 issue / orphan の有無を確認する。
2. 対象現象を `path / sheet / query / render / print` のいずれかに分類する。
3. issue に「入力・期待値・実際値・再現手順」を記録する。
4. FAQ / troubleshooting を参照し、一次回避策を適用する。
5. 再発条件がある場合は contract test 候補として `03_Implement/test` へ還流項目を起票する。

---

## 2. サポート runbook 記録テンプレート（必須項目）
サポート記録には、最低限次の 8 項目を残す。

1. 問い合わせID / 発生日
2. 失敗分類（path/sheet/query/render/print）
3. 入力（対象 Markdown / 外部データ / パラメータ）
4. 期待値
5. 実際値
6. 再現手順（コマンドまたは操作手順）
7. 一次回避策
8. 恒久対策（requirements / architecture / tests / issue のどこへ還流したか）

---

## 3. 文書利便性・網羅性の監査（Documentation quality gate）

### 3.1 利便性（Usability）チェック
- 最短導線: 障害タイプごとに「最初に開くべき文書」が1ステップで辿れるか。
- 検索性: 主要キーワード（triage, runbook, contract test, FAQ）で到達できるか。
- 読み分け: 対象読者（support / QA / docs）ごとに必要セクションが分離されているか。

### 3.2 網羅性（Coverage）チェック
- 前提条件、入力、期待値、実際値、制約が明記されているか。
- 失敗分類ごとに再現手順と一次回避策が記述されているか。
- 追加した FAQ / troubleshooting が関連 issue または ADR にトレース可能か。

---

## 4. サポート知見を製品品質へ還流する手順
1. 週次でサポート記録を分類し、再発頻度の高い失敗パターンを抽出する。
2. 抽出結果を以下に振り分ける。
   - 要件変更が必要: `00_Prompt/requirements.md`
   - 方針決定が必要: `01_Plans/adr/`
   - 実行タスク化が必要: `01_Plans/issues/`
   - 回帰防止が必要: `03_Implement/test`
3. 反映後、`python3 01_Plans/tools/planning_queue.py` を再実行し orphan issue が 0 であることを確認する。
4. 月次で「文書更新だけで終了した件数」と「テスト/要件まで還流した件数」を比較し、後者の比率を継続改善する。

---

## 5. Drools 由来テーブル書式の適用方針（設計文書・テストデータ）
Phase 8 では、OSS BRMS の Drools が公開している spreadsheet decision table の構造（`RuleSet` 領域 + `RuleTable` 領域、行=ルール、列=条件/アクション/属性）を、システム設計文書で必要な表パターン抽出の参照モデルとして利用する。

運用ルールは以下で固定する。
1. パターン抽出・分類の正本は `04_Documentation/phase8-drools-inspired-table-patterns.md` とする。
2. 試験データは「条件列・結果列・属性列（優先度・有効期限など）」を分離した形で作成し、再現手順に使う。
3. docs audit で不足パターンが見つかった場合、文書追記のみで終えず、必要に応じて `03_Implement/test` へ回帰観点を追加する。
