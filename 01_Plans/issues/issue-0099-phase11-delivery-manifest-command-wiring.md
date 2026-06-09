# Issue: 納品マニフェスト出力コマンドの配線 (Phase 4 完成度ギャップ)

## Meta
- Type: Feature
- Status: Done
- Priority: High
- Scope: 03_Implement/src/manifest/collectDeliveryManifest.ts, 03_Implement/src/extension.ts, 03_Implement/package.json, 03_Implement/test/collectDeliveryManifest.test.ts
- Expected verification level: unit + end-to-end (sample 実行)

## Traceability
- Related Backlog/Phase: requirements.md Phase 4「Generate Delivery Manifest コマンド」/ Phase 11 完成度ゲート
- Related ADR/Spec: ADR-0010 (Product Completion Gate)
- 同種ギャップ: issue-0093（preview 未結線）

## 背景
要件 Phase 4 は「`Generate Delivery Manifest` コマンドで、別紙扱いとなったファイル群を納品用チェックリスト（CSV）として出力する」と規定する。
しかし `generateDeliveryManifest()` は純関数として存在するだけで、**VS Code コマンドとして登録されておらず**（package.json にも extension.ts にも無し）、
利用者から到達不能だった（issue-0093 のプレビュー未結線と同種の「実装済みだが未配線」ギャップ）。さらに、ドキュメントから別紙対象を抽出して
マニフェスト行を組み立てる収集ロジック自体が存在しなかった。

## Execution Plan
### Proposed solution（実施済み）
1. `src/manifest/collectDeliveryManifest.ts` を新設（vscode 非依存・テスト可能）。Markdown を走査し、Smart Fallback で
   カード（別紙）になる埋め込みのみを `DeliveryManifestRecord[]` に収集。reason は Smart Fallback の判定理由を日本語ラベル化。
   リンク切れ・シート不在は Diagnostics 対象として除外。
2. `src/core/smartFallback.ts` に `getImmediateSmartFallbackDecision` / `getSmartFallbackDecisionAfterLoad` を export
   （既存 `shouldRenderAsCard*` を単一ロジックへ統合）。
3. `extension.ts` に `markdownMatrixInjector.generateDeliveryManifest` を `registerTextEditorCommand` で配線。
   別紙対象を CSV 化し `<filename>.delivery-manifest.csv` を同フォルダへ出力。0 件時は通知のみ、未保存時は保存を促す。
4. `package.json` に command（title: `MMI: Generate Delivery Manifest`）と activationEvent を追加。

### Acceptance criteria
- [x] `markdownMatrixInjector.generateDeliveryManifest` が package.json と extension.ts に登録されている。
- [x] 別紙（mode=card / 列10超 / セル500超 / シート未指定）の埋め込みのみが CSV 化される。
- [x] リンク切れ・シート不在の埋め込みは除外される。
- [x] unit test 9 件追加（`collectDeliveryManifest.test.ts`）、全 176 pass。
- [x] 代表 SIer サンプルで end-to-end 実行し CSV 出力を確認（`design-doc-sample.delivery-manifest.csv`、別紙 1 件）。

### Validation plan（実績）
- `npm run build` / `npm test` exit 0（176 pass）。
- `extensionIntegration.test.ts` の command/activationEvent 完全一致アサーションを更新。
- サンプル実行: `04_Documentation/samples/sier-design/design-doc-sample.delivery-manifest.csv` 生成（reason=mode=card 指定）。
