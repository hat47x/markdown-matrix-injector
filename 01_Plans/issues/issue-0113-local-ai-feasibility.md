# Issue: 追加API課金を伴わないローカルAIの実現性検証

## Meta
- Type: Feature
- Status: Draft
- Priority: Medium
- Scope: ローカル推論adapter試作, 評価fixture, evidence（製品採用は結果後）
- Expected verification level: manual-e2e

## Traceability
- Related Requirement: requirements.md「執筆支援」「公開品質」
- Related ADR/Spec: ADR-0016-notation-first-input-assistance.md, 04_Documentation/spec/mmi-notation-v1.md
- Dependency: 主経路の前提にはしない。issue-0193 / ADR-0018のCognitive Contractに従い、具体的なbounded taskが定まったときに評価する

## Execution Plan
### Proposed solution
[入力支援企画](../input-assistance-proposal.md)の該当範囲を1件ずつ実施する。今回は企画のみで未着手。ADRの提案を具体化してからOpenへ変更する。

### Acceptance criteria
- [ ] Windowsローカル環境でローカルモデルとクラウド無効化を確認。ネット遮断下で正常提案を生成し、外部通信・外部API課金を生じない。
- [ ] 明示操作1回に最大1要求。停止・タイムアウト・未導入・モデル不在で選択式入力へ戻り、自動再試行や有料先への切替をしない。
- [ ] 文法を満たす候補でも利用者の確認前には適用しない。元データの書込み機能・任意コマンド実行を提供しない。
- [ ] 正常10件、曖昧5件、非対応/悪意ある5件を評価し、構文成功と意図一致を別計測する。正常は9/10以上を採用目標とし、誤った自動適用は0件を必須とする。
- [ ] モデル/量子化/ライセンス/メモリ/端末、初回ロード、通常応答時間を記録し、採用/改善/見送りを結論にする。無償クラウド枠をローカル実行とみなさない。

### Validation plan
既存のビルド・単体・Extension Hostを回帰検査する。新しい動作は実VS Codeで確認し、候補選択・キャンセル・Undo・原本ハッシュと通信範囲を記録する。測定値を取得するまでは性能やAI品質の目標を達成済みとしない。

## Remaining work

ローカルLLMはMMI内部の軽量認知候補の一つとして維持するが、主経路の前提にはしない。Fly-inspired matcher、Jev類似のbounded model、決定論的規則で不足する具体的な判断タスクが定まったときに、本Issueで比較評価する。

- まず対象タスクを閉じた形で定義する（例: Candidate種別の限定分類、短い説明の補助）。
- CPUのみで実用的かを測り、既存の規則・疎表現・Jev類似方式と同条件で比較する。
- 性能・精度が不足しても課金型外部LLMへ自動切替しない。
- 採用しない場合もAuthority Planeと外部LLM handoff（issue-0112）は影響を受けない。
