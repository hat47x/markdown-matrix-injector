# Docs Audit Feedback Loop Template

## 0. Purpose
- このテンプレートは、公開ドキュメント整備で発見した課題を **requirements / architecture / test / product gap** に分類し、正本へ確実に還流するための運用記録フォーマット。
- **Gate C（docs audit + feedback 分類）** を明示し、監査手順・分類手順・完了判定を単独で実施できる形に統一する。

## 1. Operations Procedure（運用手順）

### 1.0 Gate Flow（固定順序）
1. Gate A: Overview → Tutorial → Scenario → Reference の導線監査
2. Gate B: Reference 品質監査
3. **Gate C: docs audit 実施 + feedback 分類（本テンプレート範囲）**
4. Gate D: scorecard 記録
5. Gate E: `planning_queue.py` による triage 可視化

> 本テンプレートは Gate C の実務正本。Gate D/E の参照情報（判定・triage要約）も同時に残す。

### 1.1 Gate C 実施タイミング
以下のいずれかに該当した時点で docs audit（Gate C）を実施する。
1. 公開ドキュメントの新規追加/大幅改訂を行った直後。
2. イテレーション完了時（例: 週次クローズ、Phase 内マイルストーン）。
3. 仕様不整合・導線不明瞭・再現不能手順を発見した直後。

### 1.2 Gate C 入力（Input）
- 対象ドキュメント（変更対象の `04_Documentation/*` など）
- 参照正本（`00_Prompt/requirements.md`、関連 `02_Architecture/*`、関連 `03_Implement/test/*`、関連 `01_Plans/issues/*`）
- 直近の issue / ADR 状態（`python3 01_Plans/tools/planning_queue.py` 出力）
- 分類テンプレート（`01_Plans/templates/docs-feedback-classification-template.md`）

### 1.3 Gate C 出力（Output）
- 本テンプレートに沿った監査記録（Audit Record）
- 分類済みフィードバック一覧（`requirements / architecture / test / product gap`）
- 反映アクション（要件更新・設計更新・テスト追加・issue 化）の追跡リンク
- 監査サマリ（測定日 / 対象文書 / 判定 / 次アクション / 反映先リンク）

### 1.4 Gate C 完了条件（Definition of Done）
- [ ] 監査対象・観点・結果が記録されている
- [ ] 全フィードバックが `requirements / architecture / test / product gap` のいずれかに分類済み
- [ ] `未分類` 件数が 0
- [ ] 各項目に反映先（ファイル/issue/ADR）または対応方針が紐づいている
- [ ] triage 実行結果（planning_queue）を記録している
- [ ] 監査サマリ（測定日 / 対象文書 / 判定 / 次アクション / 反映先リンク）を記録している
- [ ] Closure Rule（未分類ゼロ + 反映先リンク完備）を満たしている

---

## 2. Feedback Classification Template

> ルール: 1項目につき1分類を基本とし、複数分類に跨る場合は主分類を1つ決めて副作用をメモする。

| ID | Summary | Category | Severity | Source Doc | Recommended Action | Upstream Target | Owner | Due | Status |
|---|---|---|---|---|---|---|---|---|---|
| FB-001 | 例: 導入手順が前提不足 | requirements | High | 04_Documentation/... | 前提条件を要件へ明文化 | 00_Prompt/requirements.md | TBU | YYYY-MM-DD | Open |
| FB-002 | 例: パラメータ説明が設計と齟齬 | architecture | Medium | 04_Documentation/... | 設計記述を更新 | 02_Architecture/... | TBU | YYYY-MM-DD | Open |
| FB-003 | 例: 手順はあるが検証ケース不足 | test | Medium | 04_Documentation/... | テストケース追加 | 03_Implement/test/... | TBU | YYYY-MM-DD | Open |
| FB-004 | 例: 利用者価値の訴求不足 | product gap | Low | 04_Documentation/... | シナリオ/FAQを補強 | 01_Plans/issues/... | TBU | YYYY-MM-DD | Open |
| FB-XXX | 未分類項目が出た場合の一時退避 | 未分類 | Critical | (記入) | 24h以内に正式分類 | (記入) | TBU | YYYY-MM-DD | Triage Required |

### Category Decision Guide
- **requirements**: 仕様正本の不足/曖昧さ/矛盾に起因。
- **architecture**: I/F・責務分離・設計判断の不足/矛盾に起因。
- **test**: 再現手順・受入条件・自動/手動検証の不足に起因。
- **product gap**: 価値訴求・UX導線・利用シナリオ不足に起因。
- **未分類**: 一時状態。次回定例まで持ち越し禁止。

---

## 3. Audit Record（監査記録テンプレート + サンプル欄）

### 3.1 Audit Metadata
- Audit ID: `AUDIT-YYYYMMDD-XX`
- 測定日: `YYYY-MM-DD`
- Auditor: `(name or agent)`
- Iteration/Phase: `(e.g., Phase 6 / weekly close)`
- 対象文書:
  - `04_Documentation/...`
- Related Issue/ADR:
  - `01_Plans/issues/issue-0019-phase6-feedback-loop-operations.md`
  - `01_Plans/adr/...`

### 3.1.1 監査サマリ（必須）
- 判定: `Closed / Needs Follow-up`
- 次アクション:
  1. `(記入)`
  2. `(記入)`
- 反映先リンク:
  - requirements: `(path/url or N/A)`
  - architecture: `(path/url or N/A)`
  - test: `(path/url or N/A)`
  - product gap: `(path/url or N/A)`

### 3.2 Checklist
- [ ] 手順は前提条件・期待結果まで一貫している
- [ ] 要件/設計と記述矛盾がない
- [ ] スクリーンショット/サンプル/FAQの過不足を評価した
- [ ] すべての発見事項を分類表に登録した

### 3.3 Findings Log（Sample）
| Finding ID | Observation | Evidence | Category | Action |
|---|---|---|---|---|
| F-001 | クイックスタートに実行前提が不足 | README 手順 2 で依存未記載 | requirements | requirements.md に前提条件を追記 |
| F-002 | パラメータ `mode` の説明が設計文書とズレ | ドキュメントは既定値 `table`、設計は Smart fallback | architecture | 設計/文書どちらを正とするかADR確認後に統一 |
| F-003 | エラー系の検証手順が未定義 | 失敗時UIの期待結果が未記載 | test | e2e/手動テスト観点を issue 化 |
| F-004 | 利用者別の導線が薄く導入価値が伝わらない | FAQ/比較表が未整備 | product gap | 活用シナリオ章と比較表を追加 |

### 3.4 Triage Result
- Command:
  - `python3 01_Plans/tools/planning_queue.py`
- Summary:
  - pending issue: `(count)`
  - pending ADR: `(count)`
  - orphan issue: `(count)`
- Follow-up:
  - `(例) orphan を issue-00xx にリンク付け`

### 3.5 Closure Note
- 未分類件数: `(number)`
- 判定: `Closed / Needs Follow-up`
- Reason:
  - `(完了条件を満たした根拠を記載)`

> Gate C Rule: `未分類件数 > 0` の場合、`判定 = Closed` は不可（必ず `Needs Follow-up`）。
> Closure Rule: `未分類件数 = 0` かつ全項目に反映先がある場合のみ `Closed`。

---

## 4. Operational Introduction Steps（運用導入手順）
1. 本テンプレートを `01_Plans/templates/` からコピーし、監査単位ごとに新規記録を作成する。
2. 監査対象ドキュメントと正本を突合し、Findings を分類表へ記録する。
3. `未分類` をゼロ化し、各項目へ反映先リンクを付与する。
4. `python3 01_Plans/tools/planning_queue.py` を実行し、triage結果を `3.4` に記録する。
5. 完了条件チェックを満たしたら Closure Note を `Closed` として確定する。
