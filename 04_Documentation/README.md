# 04_Documentation

このディレクトリは、利用者・導入担当者・運用担当者に公開する文書を格納する領域です。
セットアップ手順、運用手順、ユーザー向けガイド、公開可能な検証手順などを配置します。

## Gist publication policy
- `04_Documentation/` の文書は、**すべて Markdown 形式で体系立てて記述**し、Gist ページとして公開する前提で管理します。
- README では「ローカル正本 (`04_Documentation/*.md`)」と「公開先 Gist」を 1 対 1 で対応付けます。
- Gist URL は公開後に実 URL へ差し替えます（下表はプレースホルダ）。

## Public documentation map (Local + Gist)
| Category | Local canonical file | Public Gist page |
|---|---|---|
| Overview | `04_Documentation/overview.md` | [Gist: MMI Overview](https://gist.github.com/<YOUR_GITHUB_ACCOUNT>/mmi-overview) |
| Tutorial | `04_Documentation/tutorial.md` | [Gist: MMI Tutorial](https://gist.github.com/<YOUR_GITHUB_ACCOUNT>/mmi-tutorial) |
| Scenario guide | `04_Documentation/scenario-sier-design-docs.md` | [Gist: MMI SIer Scenario Guide](https://gist.github.com/<YOUR_GITHUB_ACCOUNT>/mmi-scenario-sier-design-docs) |
| Reference | `04_Documentation/reference.md` | [Gist: MMI Reference](https://gist.github.com/<YOUR_GITHUB_ACCOUNT>/mmi-reference) |
| Developer setup | `04_Documentation/developer-setup.md` | [Gist: MMI Developer Setup](https://gist.github.com/<YOUR_GITHUB_ACCOUNT>/mmi-developer-setup) |
| VSCode E2E guide | `04_Documentation/vscode-e2e-testing.md` | [Gist: MMI VSCode E2E Guide](https://gist.github.com/<YOUR_GITHUB_ACCOUNT>/mmi-vscode-e2e-testing) |

| Full-spec sample markdown | `04_Documentation/samples/mmi-full-spec-sample.md` | [Gist: MMI Full Spec Sample Markdown](https://gist.github.com/<YOUR_GITHUB_ACCOUNT>/mmi-full-spec-sample-markdown) |

## Documentation policy reminder
- 公開文書だけに仕様差分を閉じ込めず、要件は `00_Prompt/requirements.md`、設計は `02_Architecture/`、計画は `01_Plans/` に戻します。
- 各文書は少なくとも対象読者、前提条件、期待結果、関連文書、既知の制約を明示します。

## Full-spec sample assets
- Comprehensive sample markdown: `04_Documentation/samples/mmi-full-spec-sample.md`
- Comprehensive sample Excel workbook (generated): `04_Documentation/samples/mmi-full-spec-sample.xlsx`
- Excel generator script: `04_Documentation/samples/generate_mmi_full_spec_sample_xlsx.py`

この 2 つをセットで使うことで、Phase 1〜5 の主要仕様（基本記法、query 変換、印刷制御、Smart Fallback、Phase 5 手動確認観点）を通しで再現できます。

> Codex/GitHub PR 制約（バイナリ非対応）により `.xlsx` はリポジトリへ含めず、上記 generator script で人手生成する運用とします。
