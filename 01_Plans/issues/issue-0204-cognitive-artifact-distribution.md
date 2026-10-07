# Issue: 認知model・profile資産のmanifestと配布経路を設計する

## Meta
- Type: Architecture / Feature
- Status: In Progress
- Priority: Medium
- Scope: Cognitive artifact manifest、download/cache、artifact source adapters、docs
- Expected verification level: integration

## Traceability
- Related ADR/Spec: ADR-0018、ADR-0020 D6・D9、製品要求「認知資産の配布」
- Dependency: issue-0193（Cognitive/Candidate provenance contract）。実model採用は各要件Issueの評価後

## 背景

Fly/Jev類似方式やローカルLLMを実用化すると、実行コードよりmodel weight、prototype、index、embedding等の方が大きくなる場合がある。MMI本体を最小配布に保つには、認知資産をCore/CLI/VS Code拡張から分離し、必要な機能だけ取得できる必要がある。

保存先はGitHubだけに固定しない。GitHub Release / LFS、model hub、object storage等を利用可能にし、Coreはcontent digestとmanifestを基準にartifactを扱う。またOllama、LM Studio等の導入済みlocal runtimeがmodel/cacheを管理している場合は、それを外部artifact source / runtime-managed cacheとして再利用し、MMI側へ重複保存しない。

## Acceptance criteria

- [x] Cognitive Artifact Manifest v0を定義し、artifact id / kind / version / sha256 / byte size / license / source URI / compatible provider version / schema versionを持たせる。`mmi schema cognitive-artifact`で機械可読schemaも取得できる。
- [x] artifact sourceをinterface化し、local file / HTTPS / runtime-managedを同じresolverで扱う。Ollama / LM Studioの既存modelはruntime-managed inventoryへ変換する。manifestと同一artifactと確定するには暗号学的digestを要求し、model名だけでは確定しない。特定model hub/runtime SDKをCore必須依存にしない。
- [x] GitHub Releases / Git LFS / Hugging Face Hub / object storage / runtime-managedを比較し、`02_Architecture/cognitive-artifact-distribution-v0.md`へ記録した。public assetはv0のHTTPS sourceで扱い、private assetの認証は資格情報をmanifestへ埋め込まず別境界とする。
- [x] 大型artifactは初回起動時に自動取得しない。`mmi artifact <manifest> --provider <id@version>`はsize / source / cache状態を表示するだけで、HTTPS取得は`--download`を明示した場合だけ行う。
- [x] HTTPS downloadはstreamingでsize上限を監視し、完了後にbyte sizeとSHA-256を照合する。両方が一致した場合だけcontent-addressed cacheへ原子的に確定し、不一致・途中失敗では一時fileを削除する。
- [x] MMI cacheはSHA-256をkeyにし、provider / projectを跨いで同じbytesを再利用する。既存entryは利用前にsize / digestを再確認する。runtime-managed artifactはdigest一致を確認できる場合にその場で利用し、MMI cacheへ複製しない。v0では自動GCを行わない。
- [x] `--offline`ではHTTPSへアクセスせず、verified cache / local file / digest確認済みruntime-managed artifactだけを使う。利用できない場合は認知providerを`unavailable`とし、通常検索やAuthority Planeは継続する。
- [x] artifact version / digestをcode versionから分離した。v0はcompatible providerを`id + exact version`で照合し、schema version不一致も拒否する。Ollamaで選択したsemantic modelはruntime digestを設定へ固定し、同じtag名でもdigestが変わればsemantic laneを実行しない。
- [ ] artifact size、download量、disk cache、cold availabilityを認知方式の評価結果へ含める。


## Implementation checkpoint (2026-10-07)

`src/core/cognitiveArtifact.ts`にCognitive Artifact Manifest v0とresolverを実装した。sourceは`local-file`、`https`、`runtime-managed`の3種類とし、cacheはSHA-256によるcontent-addressed配置とする。local fileは境界内realpathをその場で検証し、HTTPSは明示download時だけstreaming取得する。runtime-managed sourceは、runtimeが公開するSHA-256とmanifest digestが一致する場合だけ同一artifactとして扱う。

`mmi artifact`と`mmi schema cognitive-artifact`を追加した。前者は取得前にartifact size、license、source、provider互換性、cache状態を確認できる。HTTPS downloadは`--download`が必要で、`--offline`とは排他的である。

既存local embedding discoveryをruntime-managed artifact inventoryへ接続した。Ollamaはdigest / sizeを保持できる。LM Studioは現在のMMI REST discoveryではsizeとruntime identityまでしか得られないため、manifest SHA-256を確認できない限り同一artifactとは確定しない。

Ollamaのモデル選択では`search.semantic.artifactDigest`へdigestを保存する。semantic laneを使う前にruntimeの現在digestを再確認し、不一致・runtime停止・確認不能なら意味検索だけを停止して通常検索へ戻る。provider-dependent機能の不調をAuthorityや通常検索へ波及させない。

resolverは評価用に`artifactBytes / downloadedBytes / cacheHit / availableWithoutNetwork`を返す。各認知方式の評価reportへこの4値を組み込む接続はまだ行っていない。

## Validation plan

unit fixtureではmanifest validation、local file、HTTPS streaming、digest / size不一致、cache再利用、offline、provider version不一致、runtime-managed digest、redirect後HTTPS確認、metricsを確認する。CLI fixtureではschema、local、download-required、offline、provider不一致を確認する。次に実model repositoryとOllama実modelを使うintegrationで、artifact identityとcold/cache hit時の取得量を測る。

## Remaining work

- `artifactBytes / downloadedBytes / cacheHit / availableWithoutNetwork`を、認知方式の評価reportへ共通項目として接続する。
- 小型の公開artifactと実Ollama embedding modelでintegrationを行い、cache hit / cold / offline / tag digest driftを実測する。
- private modelの認証方式は、実際にprivate assetが必要になった時点で別途安全境界を定める。
- model量子化や分割downloadは、実artifactのサイズ測定後に検討する。
