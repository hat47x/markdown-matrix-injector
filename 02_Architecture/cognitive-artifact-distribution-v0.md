# Cognitive Artifact Manifest v0 と配布・cache境界

## 目的

MMIの認知機能で使うmodel weight（モデルの重み）、prototype（比較の基準となる特徴表現）、index（検索用の索引）、profile等の認知資産は、CoreやVS Code拡張へ同梱しない。認知資産はコードとは別のライフサイクルで更新できる一方、実行時には「どのbytes（資産の実データ）を、どのprovider（推定処理の提供元）で使ったか」を再現できる必要がある。

v0では、認知資産をmanifest（資産の識別情報や取得元などを記述する定義）、artifact bytes（資産の実データ）、providerの3つに分けて扱う。

1. **manifest** — artifactのidentity、size、license、互換provider、取得元を記述する。
2. **artifact bytes** — local file、HTTPS、または既存local runtimeが管理するbytes。
3. **provider** — artifactを使って推定を行う実装。artifactそのものとは別にversionを持つ。

認知結果はAuthorityではない。artifactが取得できない、digest（ファイル内容の照合値）が一致しない、providerが非互換である場合も、MMIのparser（記法の解析）、resolver（参照先の解決）、原本照合、通常検索等は動作を継続する。

## Manifest v0

schema id（構造定義の識別子）は `mmi.cognitive-artifact-manifest/v0`、schema version（構造定義の版）は `0` とする。

必須項目は次のとおり。

- `schema`
- `schemaVersion`
- `artifactId`
- `kind`
- `version`
- `sha256`
- `sizeBytes`
- `license`
- `compatibleProviders[]`
- `sources[]`

`compatibleProviders` はv0では `id + exact version`（providerの識別子と厳密な版指定）の組とする。semver range（バージョン範囲指定）は、provider側の互換保証をMMIが検証できる契約ができるまで導入しない。

manifestのJSON Schemaは次のコマンドで取得できる。

```sh
mmi schema cognitive-artifact
```

## Source

### local-file

manifestと同じ配布物や管理領域にあるartifactを参照する。URIはmanifest fileからではなく、resolver（参照先を解決する処理）へ渡した `localRoot`（ローカルの基準ディレクトリ）からの相対pathとする。realpath（シンボリックリンク解決後の実体パス）が `localRoot` の外へ出るpathは受け付けない。

MMIはlocal fileをcache（再利用のための保存領域）へコピーせず、その場でsize（ファイルの大きさ）とSHA-256（内容から算出する照合値）を照合して利用する。

### https

public artifact（公開された認知資産）や、認証を必要としない配布基盤を対象とする。v0はHTTPSだけを許可し、URIへのcredential（認証情報）の埋め込みは拒否する。

MMIは起動時やsemantic search（意味による検索）の開始時に自動downloadしない。CLI（コマンドライン操作）では、まず次のようにmanifestと取得予定量を確認する。

```sh
mmi artifact artifact.json \
  --provider local-embedding:ollama@1
```

互換providerについて、cacheに該当資産が存在せず、local/runtime source（端末内のファイルや実行環境が管理する資産）も利用できない場合、manifestにHTTPS sourceがあり、`--offline` が指定されていなければ `download-required` を返す。HTTPSへアクセスするのは、利用者が `--download` を明示した場合だけである。

```sh
mmi artifact artifact.json \
  --provider local-embedding:ollama@1 \
  --download
```

downloadはstreaming（受信した部分から順次処理する方式）で行い、受信中に期待sizeを超えた時点で中止する。完了後にbyte sizeとSHA-256を照合し、両方が一致した場合だけcontent-addressed cache（内容の照合値を鍵として保存する領域）へ原子的に確定する（途中の状態では確定させない）。失敗した一時fileは削除する。

### runtime-managed

OllamaやLM Studio等、利用者がすでに導入したruntime（モデルを動かす実行環境）がartifactを管理している場合に使う。MMI cacheへ複製しない。

runtimeのmodel名はartifact identity（資産の同一性を示す情報）ではない。manifestのSHA-256とruntimeが公開する暗号学的digestが一致した場合だけ、同一artifactとして扱う。

文書に記録されたlocal embedding discovery（端末内の埋め込みモデルの検出）の範囲では、Ollamaはmodel digestとsizeを取得できる。LM StudioのREST model一覧からはsizeとruntime内のmodel identityは取得できるが、MMIがmanifestのSHA-256と照合できるdigestは得ていない。そのためLM Studio modelをruntime-managed sourceとして検出しても、digestを確認できない限りmanifest artifactと同一とは確定しない。

## Cache

MMIが取得したartifactはSHA-256で配置する。

```text
<cache-root>/
  sha256/
    ab/
      abcdef...
```

同じdigestであれば、artifact id、project、providerが違っても同じcache entry（保存済み資産）を再利用する。modelのversion名が同じでもdigestが違えば別entryになる。既存entryは利用前にsizeとSHA-256を再確認し、破損していればfail-closed（安全側として利用を認めない扱い）とする。

既定のcache rootは次のとおり。

- Windows: `%LOCALAPPDATA%\MMI\cognitive-artifacts`
- Linux等: `$XDG_CACHE_HOME/mmi/cognitive-artifacts`。未指定時は `~/.cache/mmi/cognitive-artifacts`
- 共通上書き: `MMI_COGNITIVE_ARTIFACT_CACHE`

v0では自動GC（不要な保存データの自動回収）を行わない。content-addressed entryを暗黙に失効させるとoffline再現性（ネットワークなしで同じ条件を再現できること）を損なうためである。容量管理が必要になった場合は、last-access（最終利用時刻）等の証拠を別に持ち、利用者が確認できる削除操作として設計する。

## Offline

`--offline`（ネットワークを使わない指定）ではHTTPSへアクセスしない。

verified cache（照合済みのcache）、local file、またはdigestまで確認できるruntime-managed artifactがあれば利用できる。いずれも無い場合は該当する認知providerだけを `unavailable`（利用できない状態）とする。通常検索やAuthority Planeへfallback（代替経路への切り替え）の権限を持ち込まない。

## 既存local embeddingとの接続

「端末内の意味検索モデルを選択」でOllama modelを選んだ場合、MMIはruntimeが公開するdigestを `search.semantic.artifactDigest` へ保存する。

semantic lane（意味検索の処理経路）を使う前に、同じmodel名が現在も同じdigestを指しているかをOllamaへ確認する。digestが変わった、runtimeが停止した、または確認できない場合はsemantic laneを実行せず、BM25 / FlyHash等の通常検索結果をそのまま返す。

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

Git LFSはGit repositoryにpointer file（実ファイルへの参照を記したファイル）を置き、large file（大きなファイル）自体を別storage（保存領域）へ保存する。source treeとmodelを同時に管理したい場合には有効だが、runtime取得はGit/LFSのcheckout（ファイルの取り出し）と帯域・storage quota（容量制限）に結び付く。

MMIの「必要な認知機能だけを利用時に取得する」標準経路にはしない。開発・研究repository内でartifactを管理する用途は妨げない。

公式資料:
- https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-git-large-file-storage
- https://docs.github.com/en/billing/concepts/product-billing/git-lfs

### Hugging Face Hub等のmodel hub

Hugging Face Hubはrevision（参照する版）をcommit hash（コミットの識別値）へ固定でき、公式clientはversion-aware cache（版を区別する保存領域）を持つ。同じblob（ファイル内容）の再downloadを避ける設計も備える。

model ecosystem（モデルを配布・利用する仕組み）を利用する場合の有力候補だが、MMI Coreの必須SDK（開発用のライブラリ群）にはしない。v0では、public fileをHTTPS sourceとしてmanifest digestへ束縛する方法を基本とする。

将来Hugging Face専用adapterを追加する場合は、Hubのrevision pinと既存cacheを再利用し、MMI cacheへ同じblobを重複保存しないことを要件とする。private repositoryのtoken、資格情報保存、組織policyはそのadapterの安全境界として別途設計する。

公式資料:
- https://huggingface.co/docs/huggingface_hub/en/guides/download
- https://huggingface.co/docs/huggingface_hub/guides/manage-cache

### Object storage / 社内配布

署名不要のHTTPSで配布できる場合はv0の `https` sourceをそのまま使える。認証付きURL、短期署名URL、社内proxy等が必要な場合は、credentialをmanifestへ埋め込まず、認証providerを別契約として追加する。

## 評価に残す値

artifact resolver（認知資産の取得先を解決する処理）は、認知方式の評価に使える次の値を返す。

- `artifactBytes`
- `downloadedBytes`
- `cacheHit`
- `availableWithoutNetwork`

この4値は、精度・latency（処理の遅延）に加え、初回取得量、disk footprint（保存容量の使用量）、offlineでのcold start（事前準備のない状態からの起動）を同じ評価表で検討するための手掛かりとなる。ただし、これらの値だけで実際のディスク占有量やcold startの成功を測定したことにはならない。評価reportでは`mmi.cognitive-artifact-evaluation/v0`を共通形とし、artifact identity、provider identity、resolution種別とこの4値を一緒に保持する。artifactを測っていない場合は`not-measured`を明示し、欠測を0として扱わない。

最初の利用箇所はCPU semantic評価（CPUを用いた意味検索の評価）である。`--artifact-manifest`を指定した評価では、MMI cacheに同じbytesがあることだけでは実行modelの証拠にせず、選択中のruntimeが公開するmodel digestをmanifest SHA-256と照合する。digest一致を確認できるruntime-managed modelだけを評価対象にし、reportへ`artifactEvaluation`を含める。runtime digestを確認できない場合は、精度・latencyだけを測ってartifact cost（資産の取得・保持に伴う負担）を推測するのではなく、manifest指定評価自体を開始しない。

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
