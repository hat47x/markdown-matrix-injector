# Cognitive Artifact Manifest v0 と配布・cache境界

## 目的

MMIの認知機能で使うmodel weight、prototype、index、profile等は、CoreやVS Code拡張へ同梱しない。認知資産はコードとは別のライフサイクルで更新できる一方、実行時には「どのbytesを、どのproviderで使ったか」を再現できる必要がある。

v0では、認知資産を次の3つに分けて扱う。

1. **manifest** — artifactのidentity、size、license、互換provider、取得元を記述する。
2. **artifact bytes** — local file、HTTPS、または既存local runtimeが管理するbytes。
3. **provider** — artifactを使って推定を行う実装。artifactそのものとは別にversionを持つ。

認知結果はAuthorityではない。artifactが取得できない、digestが一致しない、providerが非互換である場合も、MMIのparser、resolver、原本照合、通常検索等は動作を継続する。

## Manifest v0

schema idは `mmi.cognitive-artifact-manifest/v0`、schema versionは `0` とする。

必須項目は次のとおり。

- `artifactId`
- `kind`
- `version`
- `sha256`
- `sizeBytes`
- `license`
- `compatibleProviders[]`
- `sources[]`

`compatibleProviders` はv0では `id + exact version` の組とする。semver rangeは、provider側の互換保証をMMIが検証できる契約ができるまで導入しない。

manifestのJSON Schemaは次のコマンドで取得できる。

```sh
mmi schema cognitive-artifact
```

## Source

### local-file

manifestと同じ配布物や管理領域にあるartifactを参照する。URIはmanifest fileからではなく、resolverへ渡した `localRoot` からの相対pathとする。realpath後に `localRoot` 外へ出るpathは受け付けない。

MMIはlocal fileをcacheへコピーせず、その場でsizeとSHA-256を照合して利用する。

### https

public artifactや、認証を必要としない配布基盤を対象にする。v0はHTTPSだけを許可し、URIへのcredential埋め込みは拒否する。

MMIは起動時やsemantic search開始時に自動downloadしない。CLIでは、まず次のようにmanifestと取得予定量を確認する。

```sh
mmi artifact artifact.json \
  --provider local-embedding:ollama@1
```

cacheにもlocal/runtime sourceにも無ければ `download-required` を返す。HTTPSへアクセスするのは、利用者が `--download` を明示した場合だけである。

```sh
mmi artifact artifact.json \
  --provider local-embedding:ollama@1 \
  --download
```

downloadはstreamingで行い、受信中に期待sizeを超えた時点で中止する。完了後にbyte sizeとSHA-256を照合し、両方が一致した場合だけcontent-addressed cacheへ原子的に確定する。失敗した一時fileは削除する。

### runtime-managed

OllamaやLM Studio等、利用者が既に導入したruntimeがartifactを管理している場合に使う。MMI cacheへ複製しない。

runtimeのmodel名はartifact identityではない。manifestのSHA-256とruntimeが公開する暗号学的digestが一致した場合だけ、同一artifactとして扱う。

現行のlocal embedding discoveryでは、Ollamaはmodel digestとsizeを取得できる。LM Studioの現在のREST model一覧からはsizeとruntime内のmodel identityは取得できるが、MMIがmanifestのSHA-256と照合できるdigestは得ていない。そのためLM Studio modelをruntime-managed sourceとして検出しても、digestを確認できない限りmanifest artifactと同一とは確定しない。

## Cache

MMIが取得したartifactはSHA-256で配置する。

```text
<cache-root>/
  sha256/
    ab/
      abcdef...
```

同じdigestであれば、artifact id、project、providerが違っても同じcache entryを再利用する。modelのversion名が同じでもdigestが違えば別entryになる。既存entryは利用前にsizeとSHA-256を再確認し、破損していればfail-closedとする。

既定のcache rootは次のとおり。

- Windows: `%LOCALAPPDATA%\MMI\cognitive-artifacts`
- Linux等: `$XDG_CACHE_HOME/mmi/cognitive-artifacts`。未指定時は `~/.cache/mmi/cognitive-artifacts`
- 共通上書き: `MMI_COGNITIVE_ARTIFACT_CACHE`

v0では自動GCを行わない。content-addressed entryを暗黙に失効させるとoffline再現性を損なうためである。容量管理が必要になった場合は、last-access等の証拠を別に持ち、利用者が確認できる削除操作として設計する。

## Offline

`--offline` ではHTTPSへアクセスしない。

verified cache、local file、またはdigestまで確認できるruntime-managed artifactがあれば利用できる。いずれも無い場合は該当する認知providerだけを `unavailable` とする。通常検索やAuthority Planeへfallback権限を持ち込まない。

## 既存local embeddingとの接続

「端末内の意味検索モデルを選択」でOllama modelを選んだ場合、MMIはruntimeが公開するdigestを `search.semantic.artifactDigest` へ保存する。

semantic laneを使う前に、同じmodel名が現在も同じdigestを指しているかをOllamaへ確認する。digestが変わった、runtimeが停止した、または確認できない場合はsemantic laneを実行せず、BM25 / FlyHash等の通常検索結果をそのまま返す。

LM Studio等、暗号学的digestを取得できないruntimeではこのpinを設定しない。model名だけを暗号学的identityとして扱うことはしない。

## 配布元の比較

### GitHub Releases

Release assetはbinaryをreleaseへ添付でき、public repositoryのassetは認証なしでも取得できる。asset APIはbinary downloadとredirectを扱い、現在はrelease asset metadataにSHA-256 digestも含む。

MMIの小規模・中規模artifactを製品releaseと対応付けて配布する用途には扱いやすい。GitHubのimmutable releaseを使えば、公開後のtagとassetを変更できない運用も選べる。

v0ではGitHub固有APIへ依存せず、public release assetのHTTPS URLとmanifest SHA-256を使う。private release assetの認証はv0の範囲外とする。

公式資料:
- https://docs.github.com/en/rest/releases/assets
- https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases

### Git LFS

Git LFSはGit repositoryにpointer fileを置き、large file自体を別storageへ保存する。source treeとmodelを同時に管理したい場合には有効だが、runtime取得はGit/LFSのcheckoutと帯域・storage quotaに結び付く。

MMIの「必要な認知機能だけを利用時に取得する」標準経路にはしない。開発・研究repository内でartifactを管理する用途は妨げない。

公式資料:
- https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-git-large-file-storage
- https://docs.github.com/en/billing/concepts/product-billing/git-lfs

### Hugging Face Hub等のmodel hub

Hugging Face Hubはrevisionをcommit hashへ固定でき、公式clientはversion-aware cacheを持つ。同じblobの再downloadを避ける設計も備える。

model ecosystemを利用する場合の有力候補だが、MMI Coreの必須SDKにはしない。v0では、public fileをHTTPS sourceとしてmanifest digestへ束縛する方法を基本とする。

将来Hugging Face専用adapterを追加する場合は、Hubのrevision pinと既存cacheを再利用し、MMI cacheへ同じblobを重複保存しないことを要件とする。private repositoryのtoken、資格情報保存、組織policyはそのadapterの安全境界として別途設計する。

公式資料:
- https://huggingface.co/docs/huggingface_hub/en/guides/download
- https://huggingface.co/docs/huggingface_hub/guides/manage-cache

### Object storage / 社内配布

署名不要のHTTPSで配布できる場合はv0の `https` sourceをそのまま使える。認証付きURL、短期署名URL、社内proxy等が必要な場合は、credentialをmanifestへ埋め込まず、認証providerを別契約として追加する。

## 評価に残す値

artifact resolverは、認知方式の評価に使える値として次を返す。

- `artifactBytes`
- `downloadedBytes`
- `cacheHit`
- `availableWithoutNetwork`

精度・latencyだけでなく、初回取得量、disk footprint、offlineでcold startできるかを同じ評価表へ持ち込むための最小値である。各認知方式の評価reportへこの値を転記する接続は別途行う。

## v0で行わないこと

- 起動時の自動model download
- private assetの認証情報管理
- semver rangeによるprovider互換推定
- model hub SDKのCore必須依存化
- runtime-managed artifactの無条件コピー
- model名だけによるartifact同一性の確定
- 自動cache GC
- 量子化・分割download

これらは実artifactと運用要件が確定してから追加する。
