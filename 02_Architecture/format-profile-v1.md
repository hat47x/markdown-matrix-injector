# Format Profile v1 — versioned design asset

## 1. 目的

Format Profileは、worksheet-format認識で使う既知書式を、隠れた学習状態ではなく**明示的・レビュー可能・version control可能な設計資産**として扱うための境界である。

MMI Notation v1の仕様正本ではない。Notationが「どの表をどう参照するか」を定義するのに対し、Format Profileは「組織内の既知worksheet書式をどう識別するか」の補助資産である。

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

認知providerはcandidate作成を補助できるが、承認済みprofileへ自動昇格できない。

## 3. v1データ

`FormatProfileV1`は次を保持する。

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

profileのfeaturesは、手書きの都合のよい抜粋を作る入口ではない。

candidateは既存`WorksheetFormatPrototype`から生成する。元prototypeは既存契約どおり、baseline snapshotを観測時と同じ`extractWorksheetFormatFeatures`経路へ通して生成する。

保存時のfeaturesは正規化・重複除去・sort済みでなければvalidとしない。

## 5. approval boundary

`candidate`にはapproval metadataを持たせない。

`approved`は必ず:

- `kind: human`
- non-empty `approvedBy`
- non-empty `approvalReference`

を持つ。

`formatProfileToWorksheetPrototype`はapproved profileだけを受け入れる。candidateをmatcherへ直接投入する経路は提供しない。

これは「人間らしさ」を技術的に証明する仕組みではなく、version control上で自動昇格と人間承認を区別できる**契約上の境界**である。

## 6. compatibility

approved profileでも、次が現在のruntimeと一致しなければprototypeへ戻さない。

- `featureVersion === WORKSHEET_FORMAT_FEATURE_VERSION`
- `sourceProfileId`
- `sourceEvidence`

不一致はmigrationを暗黙実行せずfail-closedする。

## 7. 更新

profile更新は既存ファイルを学習状態として上書きするのではなく、新しいcandidate差分として扱う。

推奨手順:

1. 新baselineからcandidateを再生成。
2. 既存approved profileとの差分を表示。
3. evidenceと影響をレビュー。
4. 人間が承認。
5. repository commitとして保存。

自動的な自己学習・実行時のprofile変異・認知providerによる承認は行わない。

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

保存ディレクトリや公開形式の最終配置は、実利用導線を確認した後に決める。今回の実装はschema/lifecycle/compatibility境界をpure TypeScriptとして固定する。
