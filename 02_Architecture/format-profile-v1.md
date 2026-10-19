# Format Profile v1 — versioned design asset

## 1. 目的

Format Profile（書式プロファイル）は、worksheet-format認識（ワークシートの書式の識別）で使う既知書式を、隠れた学習状態ではなく**明示的・レビュー可能・version control（版管理）可能な設計資産**として扱うための境界である。

Format ProfileはMMI Notation v1の仕様正本ではない。Notationが「どの表をどう参照するか」を定義するのに対し、Format Profileは「組織内の既知のworksheet（ワークシート）書式をどう識別するか」を扱う補助資産である。

## 2. ライフサイクル

```text
read-only baseline snapshot
  -> existing worksheet adapter
  -> WorksheetFormatPrototype
  -> Format Profile candidate
  -> diff / evidence review
  -> explicit human approval
  -> approved Format Profile
  -> compatible WorksheetFormatPrototype
```

認知provider（認知処理の提供元）はcandidate（承認前の候補）の作成を補助できるが、承認済みprofileへ自動的に昇格させることはできない。

## 3. v1データ

`FormatProfileV1`（Profileのデータ構造）は次の項目を保持する。

- `schemaVersion`: `mmi-format-profile-v1`
- stable `id`
- `label` / `purpose`
- `status`: `candidate` または `approved`
- `featureVersion`
- `sourceProfileId`
- `sourceEvidence`
- canonical `features`
- baseline provenance
  - `sourceKind`
  - `sourceDigest`
  - `generationMethod = worksheet-prototype-v1`
- approved時のみhuman approval
  - `kind = human`
  - `approvedBy`
  - `approvalReference`
  - optional `approvedAt`

## 4. canonical feature representation

profileのfeatures（書式の特徴を表す値の集合）は、都合のよい項目だけを手作業で抜き出すためのものではない。

candidateは既存の`WorksheetFormatPrototype`（照合用の書式特徴）から生成する。元になるprototypeは、既存契約どおりbaseline snapshot（基準となる読み取り結果）を観測時と同じ`extractWorksheetFormatFeatures`経路へ通して生成する。

保存するfeaturesは、正規化・重複除去・sort（並べ替え）済みでなければvalid（有効）としない。

## 5. approval boundary

`candidate`にはapproval metadata（承認に関する記録）を持たせない。

`approved`（承認済み）には、必ず次の項目を持たせる。

- `kind: human`
- non-empty `approvedBy`
- non-empty `approvalReference`

これらが必要となる。

`formatProfileToWorksheetPrototype`（Profileを照合用prototypeへ戻す処理）はapproved profileだけを受け入れる。candidateをmatcher（書式の照合処理）へ直接投入する経路は提供しない。

これは承認者が人間であることを技術的に証明する仕組みではなく、version control上で自動昇格と人間承認を区別するための**契約上の境界**である。

## 6. compatibility

approved profileでも、次の条件が現在のruntime（実行時環境）と一致しなければprototypeへ戻さない。

- `featureVersion === WORKSHEET_FORMAT_FEATURE_VERSION`
- `sourceProfileId`
- `sourceEvidence`

不一致の場合はmigration（互換性のための移行処理）を暗黙に実行せず、fail-closed（安全側として拒否）する。

## 7. 更新

profileを更新する場合は、既存ファイルを学習状態として上書きせず、新しいcandidateの差分として扱う。

推奨する手順は次のとおり。

1. 新baselineからcandidateを再生成。
2. 既存approved profileとの差分を表示。
3. evidenceと影響をレビュー。
4. 人間が承認。
5. repository commitとして保存。

自動的な自己学習、実行時のprofileの変更、認知providerによる承認は行わない。

## 8. 非責務

v1では以下を行わない。

- 永続ストレージI/O
- 自動commit
- hidden online learning
- Profile間migration
- cross-source-profile comparison
- MMI Notationの変更
- production runtime接続
- AI providerによるapproval

保存ディレクトリや公開形式の最終配置は、実際の利用経路を確認した後に決める。今回の実装ではschema（データ構造）・lifecycle（状態遷移）・compatibility（互換性）の境界を、pure TypeScript（外部I/Oを前提としない型と処理）として固定する。
