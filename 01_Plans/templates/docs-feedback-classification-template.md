# Docs Feedback Classification Template

## 0. Purpose
- docs audit で検出した論点を **requirements / architecture / test / product gap** に必ず分類し、未分類ゼロを維持するためのテンプレート。

## 1. Classification Rules
- 1論点につき主分類を1つ選ぶ（必要なら備考に副次影響を記載）。
- `未分類` は一時退避のみ許可し、同一監査サイクル内にゼロ化する。
- すべての行に反映先リンク（ファイル・Issue・ADR・PR など）を設定する。
- 監査クローズ時に `未分類 > 0` の状態を禁止する（`Closed` 判定不可）。

## 1.1 Audit Summary（必須）
- 測定日: `YYYY-MM-DD`
- 対象文書: `04_Documentation/...`
- 判定: `Closed / Needs Follow-up`
- 次アクション:
  1. `(記入)`
- 反映先リンク（監査全体）:
  - requirements: `(path/url or N/A)`
  - architecture: `(path/url or N/A)`
  - test: `(path/url or N/A)`
  - product gap: `(path/url or N/A)`

## 2. Category Definition
- **requirements**: 要件正本の不足・曖昧さ・矛盾に起因する論点。
- **architecture**: 責務分離、I/F、設計決定の不足・矛盾に起因する論点。
- **test**: 検証観点、受入条件、再現手順、テスト資産の不足に起因する論点。
- **product gap**: 価値訴求、導入導線、運用 UX の不足に起因する論点。
- **未分類**: 判定保留（完了前にゼロであることが必須）。

## 3. Classification Table

| ID | Summary | Category | Severity | Evidence | Recommended Action | 反映先 | 反映先リンク | Status |
|---|---|---|---|---|---|---|---|---|
| FB-001 | （記入） | requirements | High | （記入） | （記入） | requirements.md 更新 | （URL/Path） | Open |
| FB-002 | （記入） | architecture | Medium | （記入） | （記入） | architecture 文書更新 | （URL/Path） | Open |
| FB-003 | （記入） | test | Medium | （記入） | （記入） | test ケース更新 | （URL/Path） | Open |
| FB-004 | （記入） | product gap | Low | （記入） | （記入） | issue 起票/更新 | （URL/Path） | Open |
| FB-XXX | （記入） | 未分類 | Critical | （記入） | 24h 以内に再分類 | 暫定 | （URL/Path） | Triage Required |

## 4. Unclassified Gate
- 未分類件数: `___ 件`
- 判定: `PASS (0件) / FAIL (1件以上)`
- FAIL 時の是正期限: `YYYY-MM-DD`
- FAIL 時の次アクション: `再分類担当者・再判定日を記載`
