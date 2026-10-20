# 設計資料群の目録をCLIで作る

SEI等の生成AI基盤へ設計資料を渡す前に、対象資料と読めなかった範囲を確認する。MMIは原本を変更せず、ファイルごとのSource Identity v1と資料集合のdigestを返す。開発計画は[#618](https://github.com/hat47x/markdown-matrix-injector/issues/618)、この最初の実装は[#620](https://github.com/hat47x/markdown-matrix-injector/issues/620)で管理する。

## 実行する

```sh
mmi inventory ./sources --root . --json -o inventory.json
mmi inventory ./sources --root . --inspect --json -o inventory-inspected.json
```

最初のコマンドは所在とバイト列の同一性だけを収集する。二つ目は既存の`inspect`経路も使い、Candidateの種別別件数と診断コードを返す。原本の本文・見出し・Claim値・例外メッセージは出力しない。パスとdigestも組織の開示方針に従って扱う。

出力先は走査ディレクトリの外に置く。既存のファイルには上書きしない。出力先の指定を省くと標準出力へ書く。シェルのリダイレクトはCLIの出力先検査を通らないため、原本や走査ディレクトリ内へリダイレクトしない。

```sh
mmi inventory ./sources --root . --inspect --json \
  --exclude old-version --exclude private/credentials.txt \
  --max-bytes 8388608 -o inventory-selected.json
```

`--exclude`は走査ディレクトリからの相対パスまたはディレクトリ接頭辞であり、globではない。繰り返し指定できる。既定で`.git`・`.claude`・`node_modules`・`dist`・`artifacts`ディレクトリを除外する。除外したディレクトリの中身は読まず、その中の未走査件数も推定しない。

シンボリックリンクは辿らない。ファイルの読込み上限は既定16 MiB、`--max-bytes`で1〜268435456バイトを指定できる。上限超過はdigestなしの`excluded`になる。目録用のバイト列の取得は上限内に制限する。ただし、`--inspect`による既存解析の再読込み・展開後のOOXMLサイズ・解析時間全体の厳密な上限は保証しない。

## 結果を読む

JSONの`contract`は実験的な`mmi.source-inventory/v0`。各`identity`は既存の`source-file-bytes-v1`とsha256を使う。新しい業務モデルやSEI・TEIの意味受理契約は定義しない。

| 状態 | 意味 |
| --- | --- |
| `identified` | バイト列を識別した。構造解析は要求されていない |
| `inspected` | 既存inspectが返した結果を集計した。業務的な正しさや全情報の抽出は保証しない |
| `unsupported` | バイト列は識別したが、今回の構造解析対象の形式ではない |
| `excluded` | 設定、サイズ、symlink、非通常ファイルなどにより内容を読んでいない |
| `failed` | 読込みまたは解析に失敗した。原因の区分は`reason`で確認する |
| `changed` | 読込み中または解析前後で原本変更を検出した。解析結果は返さない |

`summary`は状態別の目録エントリ数であり、除外ディレクトリの中のファイル数ではない。`status=partial`または解析診断を見落として、案件の設計情報がすべて揃ったと判断しない。

終了コードは、対象範囲の全エントリを識別し、要求した解析にも診断がなければ0、除外・未対応・失敗・変更・解析診断があれば1、引数や実行の失敗は2となる。解析を要求しなければ、PDF等もバイト列の識別までで0になり得る。`inspectionRequested`を必ず合わせて確認する。

`collectionDigest`は、scope、上限・除外設定、安定順序の相対パス、Source Identity、識別できなかった範囲から求める。原本の複製は別の所在として残す。構造解析の結果はdigestの対象に含めないため、解析の採否を示す値として使わない。

同じ設定で再実行してdigestを比べると、観測した資料集合の変化を確かめられる。ただし、除外した部分の内部変更は検出できず、異なるdigestからどの業務上の意味が変わったかも判断できない。

## 確認範囲

`consistency=per-file-observation`は、ファイルを順に観測したことを示す。ディレクトリ全体を一斉に固定したsnapshot、原本の保存コピー、敵対的なファイルシステム変更への完全な隔離ではない。実行中は対象資料を変更しない運用にする。厳密な一時点固定が必要なら、利用者が用意した読み取り専用snapshotを入力する。

この段階では、複数資料の意味統合、TEIモデルの自動生成、SEI/TEIへの送信や依存は追加しない。Data・Function・Businessの不足や矛盾の照合は、目録から必要な原本を選んで既存の`inspect`等で読む後続段階として扱う。SEI/TEIでの実受渡しと実在設計資料での効果は別に確認する。
