# Issue: Phase 6 Scenario ROI Proof（活用シナリオの意思決定証拠強化）

## Meta
- Type: Docs
- Status: Open
- Priority: High
- Scope: `04_Documentation/scenario-sier-design-docs.md`, `04_Documentation/samples/`
- Expected verification level: docs-audit

## Traceability
- Related Backlog/Phase: Phase 6: 公開ドキュメント体系化と価値訴求 (Public Documentation & Adoption)
- Related ADR/Spec: `01_Plans/adr/ADR-0003-phase6-user-value-maximization-roadmap.md`, `02_Architecture/phase6-public-documentation-architecture.md`

## Execution Plan
### Proposed solution (解決策の概要)
- SIer向けシナリオに、従来運用との差分（レビュー準備工数、別紙参照時の可読性、印刷制御の再現性）を観測可能な形で追加し、導入可否判断に使える証拠を整備する。

### Success metric (価値指標)
- 利用前/利用後比較の評価軸が最低3つ明記され、各軸に観測方法が紐づくこと。
- シナリオ文書単体で「適用条件」「期待効果」「適用しない方がよい条件」が判断できること。

### Acceptance criteria (受入条件)
- [ ] Scenario guide に「利用前/利用後」の比較観点が最低3項目追加されること。
- [ ] 各観点に対応する操作手順・期待結果・制約がセットで記載されること。
- [ ] 参照サンプル（`04_Documentation/samples/`）とのリンクが明示されること。
- [ ] 文書化で発見した product gap があれば、別issueとして起票されること。

### Task breakdown (作業分解)
- [ ] ROI観点（時間短縮・品質・監査容易性）を選定する。
- [ ] Scenario guide に比較表と観測手順を追記する。
- [ ] サンプルとの往復導線を追加する。
- [ ] 発見ギャップを issue 化しトレースを残す。

### Validation plan (検証計画)
- `rg -n "利用前|利用後|比較|ROI|工数|期待結果|適用条件" 04_Documentation/scenario-sier-design-docs.md` で比較証拠の存在を確認する。
- `rg -n "samples/" 04_Documentation/scenario-sier-design-docs.md` でサンプル導線を確認する。
- `python3 01_Plans/tools/planning_queue.py` で起票漏れや orphan がないことを確認する。
