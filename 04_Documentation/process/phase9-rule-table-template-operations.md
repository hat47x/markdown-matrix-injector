# Phase 9: ルールテーブルテンプレート運用ガイド

この文書は、Phase 9のベンチマーク用CSVと試験fixture、そこから生成する表パターンガイドを整合させるための運用手順です。以下のコマンドは実行手順・判定条件の記載であり、今回改めて検査を実行した記録ではありません。

## 対象読者
- SIer設計文書の作成者（author）
- 受入レビュー担当（reviewer）
- 納品・品質保証担当（delivery）

## 前提条件
- Phase 8のDrools参照パターン（`phase8-drools-inspired-table-patterns.md`）を理解していること。
- ベンチマークテンプレートの正本として、docs用CSVとtest fixture用CSVを同時に管理すること。
- Decisionは `ADR-0007`、Actionは `issue-0066` で追跡すること。
- 品質監査拡張（RuleId重複/必須列/日付形式）は `ADR-0008` と `issue-0067` で追跡すること。

## 期待結果
- 4種のベンチマーク表（要件トレース / 状態遷移 / 障害切り分け / リリース判定）を、同一列定義で再利用できる。
- docsとtest fixtureの片側更新を禁止し、同期差分をCLIで検知できる。
- query観測（`columns` / `grep` / `header`）の回帰をunit testで継続監査できる。

## 関連正本
- 要件: `00_Prompt/requirements.md`（Phase 9）
- 方針: `01_Plans/adr/ADR-0007-phase9-rule-table-interoperability-and-design-assetization.md`
- 実行: `04_Documentation/history/issues/issue-0066-phase9-rule-table-template-foundation.md`
- docsテンプレート: `04_Documentation/samples/phase9-rule-table-benchmark-pack.csv`
- fixtureテンプレート: `03_Implement/test/fixtures/workspace/data/phase9-rule-table-benchmark-pack.csv`

## 既知の制約
- GitHub PR制約により `.xlsx` は原則コミットせず、生成スクリプトで再現する。
- テンプレート列追加は後方互換影響があるため、`ADR` で合意してから実施する。

---

## 1. テンプレート作成ルール

### 1.1 ベンチマーク表の固定セット
Phase 9では次の4表を最小ベンチマークとして固定する。

1. 要件トレーサビリティ（RequirementsTraceability）
2. 状態遷移（StateTransition）
3. 障害切り分け（FailureTriage）
4. リリース判定（ReleaseGateDecision）

### 1.2 必須列
以下の列を順序固定で持つ。

1. `BenchmarkTable`
2. `RuleId`
3. `RuleSet`
4. `ConditionExpr`
5. `ActionExpr`
6. `Priority`
7. `EffectiveFrom`
8. `ExpiresAt`
9. `QueryExample`
10. `RelatedRequirement`
11. `RelatedTest`
12. `Owner`
13. `Notes`

### 1.3 データ記述ルール
- `RuleId` は一意（重複禁止）。
- `Priority` は数値文字列で記載し、比較可能性を維持する。
- `EffectiveFrom` / `ExpiresAt` は `YYYY-MM-DD` で記載する。
- `QueryExample` には `columns` / `grep` / `header` のいずれかを必ず含め、観測手順を埋め込む。

## 2. 更新ルール（Round-trip）

まずdocs用CSVとfixture用CSVを同期します。2026-07-09の追記で、生成ガイドも同一コミットに含める運用へ拡張されています。

1. docs用CSV（`04_Documentation/samples/...`）を更新する。
2. 同一コミットでfixture用CSV（`03_Implement/test/fixtures/...`）へ同内容を反映する。
3. `python3 03_Implement/tools/check_phase9_template_sync.py` で列同期 + 行同期（row parity）+ 品質監査（必須列/RuleId/日付形式/有効期間整合）を検証する。
4. `cd 03_Implement && npm test` でquery観測テストを実行する。
5. 差分理由・検証結果をissue-0066のValidation evidenceへ追記する。

> 片側のみ更新した状態でのマージは禁止。

### 2.0.1 [2026-07-09 追記, ADR-0013] Round-trip の3点化
docs用CSVを更新した場合、以下を **同一コミット** で追加反映する（従来のdocs/fixture 2点ルールを拡張）。

3. `04_Documentation/samples/phase9-rule-table-pattern-guide.md`（生成ガイド）を
   `python3 03_Implement/tools/generate_phase9_pattern_guide.py` で再生成し、同じコミットに含める。

再生成前に `python3 03_Implement/tools/generate_phase9_pattern_guide.py --check` を実行すると、
コミット済みガイドがdocs CSVに対して既に陳腐化していないかを確認できる（非ゼロ終了時は要再生成）。
このガイドは `04_Documentation/samples/README.md` からMMI非依存の読者向けに公開される
（ADR-0012 D7 / ADR-0013参照）。

### 2.1 監査NG時の一次対応
`phase9 template sync: NG` が出力された場合、以下の順で修復する。

1. `No such file or directory` がある場合はdocs/fixtureのパス指定を見直す。
2. `header mismatch` がある場合はdocs/fixtureの列順を一致させる。
3. `row mismatch` がある場合はdocs/fixtureの行内容・行順を一致させる。
4. `missing required column` がある場合は空欄セルを補完する（空白文字のみもNG）。
5. `duplicate RuleId` がある場合は一意なIDへ置換する。
6. `invalid date format` がある場合は `YYYY-MM-DD` へ修正する（実在しない日付もNG）。
7. `invalid date range` がある場合は `EffectiveFrom <= ExpiresAt` となるよう修正する。
8. 修正後にsync checker、続いて `npm test` を再実行し、issueのValidation evidenceへ結果を追記する。

### 2.2 任意ファイル検証（ローカル差分確認）
ローカルで一時CSVを使って検証する場合は、次の引数を使う。

```bash
python3 03_Implement/tools/check_phase9_template_sync.py --docs <docs.csv> --fixture <fixture.csv>
```

CI連携や自動集計に使う場合は、次のようにJSON形式で出力する。

```bash
python3 03_Implement/tools/check_phase9_template_sync.py --format json
```

行順のみ差分で内容一致を確認したい場合は、次のオプションを利用する（標準は順序厳格）。

```bash
python3 03_Implement/tools/check_phase9_template_sync.py --ignore-row-order
```

release gate経由で同じ緩和モードを使う場合は、`release_gate_check.py` 側で次のフラグを指定する。

```bash
python3 03_Implement/tools/release_gate_check.py --phase9-ignore-row-order
```

> 注意: `--phase9-ignore-row-order` は「行順のみ」を緩和する。行内容不一致（例: `ActionExpr` 差分）は NG のまま。

`release_gate_check.py` を `--skip-tests` で実行する場合、`--phase9-ignore-row-order` を同時指定しても
G3は実行されない。JSON出力ではG3 detailが `skipped by --skip-tests`（strict）または
`skipped by --skip-tests (ignore-row-order not evaluated)`（relaxed指定時）となる。

## 3. 同期ルール（運用チェックポイント）

- **設計チェック**: 列構成変更はADRを起票し、影響範囲（docs / fixture / test）を明示する。
- **実装チェック**: query観測テストに、最低1件は `columns + grep` の複合条件を含める。
- **納品チェック**: `planning_queue.py` でorphan issueが0件であることを確認する。

## 4. template quality gate 判定手順

| 観点 | 判定質問 | 合格条件 | 証跡コマンド |
|---|---|---|---|
| 可読性 | 列名だけで業務意図が読めるか | 4 表すべてで `RuleSet` / `Notes` が用途を説明 | `head -n 5 04_Documentation/samples/phase9-rule-table-benchmark-pack.csv` |
| 検証性 | query パラメータで再観測できるか | `QueryExample` と unit test が一致し、`npm test` が成功 | `cd 03_Implement && npm test` |
| 追跡性 | 要件・テストへ遡及できるか | docs/fixture の行内容が一致し、`RelatedRequirement` / `RelatedTest` が空欄なし、`RuleId` 重複なし、日付形式と有効期間整合が正しい | `python3 03_Implement/tools/check_phase9_template_sync.py` |

## 5. 推奨実行シーケンス

1. `python3 03_Implement/tools/check_phase9_template_sync.py`
2. `python3 03_Implement/tools/generate_phase9_pattern_guide.py --check`（ADR-0013、標準ガイドの陳腐化検知）
3. `cd 03_Implement && npm test`
4. `python3 03_Implement/tools/planning_queue.py`

この順序で、テンプレート整合性 → 標準ガイド整合性 → 回帰検証 → planning整合性を確認する。各コマンドの実行結果は、実行した時点の証跡として別途記録する。
