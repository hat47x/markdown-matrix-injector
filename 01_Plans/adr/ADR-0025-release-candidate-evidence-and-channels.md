# ADR-0025: リリース候補を一つのコマンドで作り、検証版と公開版の配布経路を分ける

- Status: Accepted（D1〜D5）。D3の公開版の条件は、ADR-0024の採択まで変わり得る
- Date: 2026-10-20
- Deciders: MMI Lead Agent（起案・D1〜D5の採択）。配布先での公開操作はHuman Sponsor
- Scope: 版付け、リリース候補の作成と証拠、配布経路、CI
- Related: [ADR-0010](ADR-0010-product-completion-gate.md)（公開に足る品質ゲートG1〜G4）、[ADR-0024](ADR-0024-product-name-layers-and-value-statement.md)（総称と識別子）、[作業ルール](../../00_Prompt/system_prompt.md)「検証と報告」、[#500](https://github.com/hat47x/markdown-matrix-injector/issues/500)、[#504](https://github.com/hat47x/markdown-matrix-injector/issues/504)、[#517](https://github.com/hat47x/markdown-matrix-injector/issues/517)、[#524](https://github.com/hat47x/markdown-matrix-injector/issues/524)

## Context (背景と課題)

最後の版は0.1.0（2026-07-15）である。その後に、CLI、Candidate契約、取り込み台帳、Extracted・Detachedの最小縦切り、VS Codeのレビュー画面と取り込みが入った。版は上がらず、CHANGELOGにも記録が無かった。利用者に渡しているのは、作業者が手元で作ったVSIXである。どのコミットから作り、どの検査を通したかは、別の検証記録を読まないと分からない。

作業ルールは、リリース判定を対象の版と成果物に結び付けることを求める。ところが、版と成果物を結ぶ手順が無かった。2026-10-20に`main`をWindowsで検査したところ、次の状態だった。

- 全体の型検査（`npm run build`）は17件の型エラーで失敗した。製品の構成（`build:product`）だけが通っていた。
- `npm test`はWindowsで成功しなかった。原因は、パス区切り、シンボリックリンクの権限、CRLFでのblobハッシュ、Microsoft Storeの`python3`スタブで、製品の不具合とは別だった。
- READMEは最低対応をVS Code 1.96.0としていたが、`engines.vscode`は1.100.0（ESM拡張）だった。1.96〜1.99の利用者は導入できない。
- GitHub Actionsは利用枠を使い切ったため、2026-09-23からすべてのjobを止めている。CIで同じ検査を回す経路も無い。

公開の判断にも、二つの事情が重なっている。ADR-0010は、G1〜G4を実機で実証するまで公開しないと決めた。#517は、拡張IDとパッケージ名を総称の決定（ADR-0024）の後、初回公開の前に移すとしている。一方で、製品の価値を確かめるには、実在の設計書を扱う書き手に配る必要がある（#524）。配らない限り価値は観測できず、観測しない限り公開の判断もできない。

検討した方式は三つある。

- 方式A: 総称と識別子が決まるまで版を上げず、配布もしない。
- 方式B: 総称を待たずに、Marketplaceとnpm registryへ公開する。
- 方式C: 版を上げ、検証版を証拠付きで限られた利用者へ配る。公開版は総称・識別子・G1〜G4の実証の後にする。

方式Aでは、価値の観測（#524）が命名の決定待ちで止まる。方式Bでは、利用者の設定やキーバインドに旧IDが残った状態で、拡張IDを変えることになる。方式Cを選ぶ。

## Decision (決定事項)

### D1. リリース候補は一つのコマンドで、一つのコミットから作る

`03_Implement`で`npm run release:candidate`を実行すると、次の手順を順に行い、`artifacts/release/<version>/`へ出力する。どれかが失敗すれば、候補を「リリース不可」とする。

1. 作業ツリーに未コミットの変更が無いことを確かめる。`--allow-dirty`を付けた予行演習は、常にリリース不可とする。
2. 版の整合を確かめる。`package.json`と`package-lock.json`の版、CHANGELOGの日付付きの節、`engines.vscode`と`@types/vscode`、READMEに書いた最低対応版が一致しなければならない。
3. 全体の型検査（`npm run build`）と製品のテスト（`npm test`）を実行する。
4. VSIXを作り、中身を監査する。必須ファイルがあること、ソース・テスト・研究層・fixture・devDependenciesが入っていないことを確かめる。さらに、拡張の入口とworkerから到達する実行時moduleがすべて同梱されていることを確かめる。`.vscodeignore`が実行時に必要なmoduleを除くと、拡張は起動時に落ちるためである。
5. CLIの自己完結tarballを作り、空のnpm cacheでofflineに導入して`mmi`を実行する（#500の検証をそのまま使う）。
6. `--e2e`を付けた場合は、Extension Host E2Eを実行する。続けて、作ったVSIXを展開したフォルダーを読み込ませて同じE2Eを実行する（`vsix-smoke`、#598）。開発中のフォルダーではなく配布物そのものを動かすため、`.vscodeignore`で必要なファイルを外した誤りもここで失敗する。付けない場合は、どちらも`not-run`と記録する。

出力は、VSIX、CLI tarball、`SHA256SUMS`、`RELEASE_NOTES.md`（CHANGELOGの該当節と検査結果）、`release-evidence.json`（`mmi.release-evidence/v1`）である。証拠には、コミット、未コミットの有無、OS・Node.jsの版、各手順の結果、成果物のSHA-256を記す。

### D2. 自動で証明できない確認は、未実施として残す

ADR-0010のG1〜G4（実VS Codeでの描画、PDF、原本非改変、動かない条件の記述）と、VSIXを最低対応版と最新版のVS Codeへ入れる確認は、候補の作成では証明できない。証拠とリリースノートには、これらを`not-run`・未チェックとして必ず載せる。人が確認したら、その版とSHA-256を添えて検証記録に残す。過去の版の確認結果を、新しい版の合格として扱わない。

### D3. 配布経路を検証版と公開版に分ける

- **検証版**は、0.x系の版で、VSIXとCLI tarballを証拠と一緒に配る。配布先はGitHub Releasesのpre-releaseまたは直接の受け渡しとする。拡張ID・パッケージ名・設定キーは現行のままで、公開版までに変わり得ることをリリースノートに書く。D1でリリース可能と判定された候補だけを配る。
- **公開版**は、VS Code MarketplaceまたはOpen VSXとnpm registryへの公開を指す。ADR-0024の総称の決定と#517の識別子の移行、そしてその版でのG1〜G4の実証を条件とする。

どちらの経路でも、公開の操作そのもの（タグの作成、Releaseの作成、Marketplaceへの登録）はHuman Sponsorが行う。外部のアカウントと資格情報を使う操作だからである。

### D4. CIは同じコマンドを呼び、有効化をコード変更から切り離す

CIのjobは`npm test`と`npm run release:candidate`を呼ぶだけにし、手元と同じ判定を使う。jobを動かすかどうかは、リポジトリ変数`MMI_ACTIONS_ENABLED`が`true`かどうかで決める。Actionsの利用枠が戻ったら、workflowを書き換えずに変数だけで再開できる。

### D5. 版はSemVerの0.xで上げ、節の無い版は作らない

機能の追加は0.xのminorを、修正だけの場合はpatchを上げる。CHANGELOGに日付付きの節が無い版は、D1の手順2で失敗させる。記法（MMI Notation v1）、`MMI_*`診断コード、`mmi.*`契約名の版は、拡張とCLIの版とは別に管理する。

## Consequences (結果と影響)

- **Good:** どのコミットから何を作り、何を通したかが成果物の隣に残る。過去の成功件数を現在の証拠として使う余地が無くなる。
- **Good:** 人が介在しなくても、エージェントやCIが同じコマンドでリリース可能かを判定できる。人の手は、D2の実機確認とD3の公開操作に集まる。
- **Good:** 総称の決定を待たずに検証版を配れるため、実在の設計書での価値の観測（#524）を始められる。
- **Bad:** 検証版の利用者は、公開版で拡張IDと設定キーが変わったとき、入れ直しと設定の移行が要る。#517が旧設定キーを読み続けることで負担を減らす。
- **Bad:** `npm run release:candidate`は全テストとCLIのoffline導入を含むため、数分かかる。`--e2e`を付けると、初回はVS Codeの取得も加わる。

## Traceability (関連情報)

- Implementation: `03_Implement/scripts/release-candidate.mjs`、`03_Implement/test/releaseCandidate.test.mjs`、`.github/workflows/ci.yml`
- Docs: [開発環境](../../04_Documentation/developer-setup.md)の「リリース候補」、[CHANGELOG](../../CHANGELOG.md)
- Related Issues: [#500](https://github.com/hat47x/markdown-matrix-injector/issues/500)（CLIの配布）、[#504](https://github.com/hat47x/markdown-matrix-injector/issues/504)・[#517](https://github.com/hat47x/markdown-matrix-injector/issues/517)（総称と識別子）、[#519](https://github.com/hat47x/markdown-matrix-injector/issues/519)（製品テストのレーン）、[#524](https://github.com/hat47x/markdown-matrix-injector/issues/524)（価値の観測）
