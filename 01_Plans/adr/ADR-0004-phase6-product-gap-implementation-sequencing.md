# ADR-0004: Phase 6 Product Gap 実装シーケンス

- Status: Accepted
- Date: 2026-03-29
- Deciders: Project Maintainers
- Scope: `01_Plans/adr/`, `01_Plans/issues/`, `03_Implement/`, `04_Documentation/`

## Context (背景と課題)
- `issue-0021` でproduct gap（観点別テンプレート自動挿入、抽出クエリ履歴のエビデンス出力）のMVP要件は定義済み。
- ただし、2機能を同時実装すると `extension.ts` / DX系テストの競合が発生しやすく、Atomic実行が崩れる。
- Phase 6ではdocs由来の価値仮説を、最小変更で実装へ接続する必要がある。

## Decision (決定事項)
1. Product gap実装は 2つの連続Issue に分割する。
   - **Issue A (先行):** 観点別テンプレート自動挿入（Snippet MVP）
   - **Issue B (後続):** 抽出クエリ履歴エビデンス出力（Query Evidence MVP）
2. 先行順は A → B とする。
   - 理由: AはUX改善で導入障壁を下げる即効性が高く、Bの監査価値を観測する入力品質も改善できるため。
3. 両Issueとも `docs-check + unit + manual-e2e` の3層検証を受入条件に含める。
4. 外部監査システム連携は本ラウンドの非対象（ローカル出力まで）。

## Consequences (結果と影響)
- **Good:** 競合しやすい共有ファイル編集を段階化し、レビューしやすい差分になる。
- **Good:** UX改善（Snippet）でROI観測手順の記述揺れを先に抑制できる。
- **Bad:** Query Evidence 機能の提供時期は1イテレーション後ろ倒しになる。

## Traceability (関連情報)
- Related Issues: `01_Plans/issues/issue-0021-phase6-scenario-product-gap-followup.md`, `01_Plans/issues/issue-0022-phase6-snippet-template-mvp.md`, `01_Plans/issues/issue-0023-phase6-query-evidence-export-mvp.md`
- Related Spec: `00_Prompt/requirements.md` (Phase 5 DX / Phase 6 feedback loop)

## 議事録 (AI読込不要)
### Issue Definition
- 2つのproduct gapを同時に進めるべきか、段階実装すべきかを決定する必要があった。

### Virtual Debate (Round 1)
- Architecture Lead: `extension.ts` 競合を避けるため段階実装が妥当。
- Product/UX Lead: ROI観測テンプレートの挿入支援を先に入れると文書品質が安定する。
- QA/Delivery Lead: 受入条件にCLI検証を固定しないとDone判定が曖昧になる。

### Synthesis & Decision
- 2Issueへ分割し、Snippet先行・Query Evidence後続で実装する。両方に同一検証レベルを課す。
