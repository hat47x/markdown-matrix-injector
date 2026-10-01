# Issue: 認知model・profile資産のmanifestと配布経路を設計する

## Meta
- Type: Architecture / Feature
- Status: Draft
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

- [ ] Cognitive Artifact Manifest v0を定義し、artifact id / kind / version / sha256 / byte size / license / source URI / compatible provider version / schema versionを持たせる。
- [ ] artifact sourceをinterface化し、少なくともlocal fileとHTTPS取得を同じ契約で扱える。加えてruntime-managed artifact（例: 導入済みOllama / LM Studioのmodel/cache）を参照する場合のidentity/digest取得方法を分離する。特定model hub/runtime SDKをCore必須依存にしない。
- [ ] GitHub Release / LFSとmodel hubを候補として比較し、model weightの版管理、取得、private asset、cache、license表示の違いを記録する。
- [ ] 大型artifactは初回起動時に自動取得せず、該当認知機能の利用時に取得サイズ・取得元を提示できる設計にする。
- [ ] download後にdigestを検証し、不一致をfail-closedする。
- [ ] local cache pathと失効規則を定義し、同じdigestを複数provider / projectで重複downloadしない。runtime-managed cacheが既に同一artifactを持つ場合はMMI cacheへ複製しない。
- [ ] offline時にcacheがあれば利用し、無ければ認知providerだけを `unavailable` とする。Authority Planeは動作を継続する。
- [ ] modelの更新はcode updateと独立可能にするが、互換provider/schema versionを満たさないmodelはロードしない。
- [ ] artifact size、download量、disk cache、cold availabilityを認知方式の評価結果へ含める。

## Validation plan

小型dummy artifactと大きめのdummy artifactを用意し、local / remote相当の2 sourceでmanifest解決、download、digest検証、cache再利用、offline、version mismatchを確認する。実model repositoryとの結合は、採用候補が決まった時点で追加する。

## Remaining work

- Hugging Face等のmodel hubは有力候補だが、製品の必須サービスにはしない。
- private modelの認証方式は、実際にprivate assetが必要になった時点で別途安全境界を定める。
- model量子化や分割downloadは、実artifactのサイズ測定後に検討する。
