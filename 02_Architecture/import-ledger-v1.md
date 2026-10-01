# Import Ledger v1

- 状態: issue-0195 の実装契約
- 関連: ADR-0019 D8・D9、Candidate契約 v1、issue-0193・0194・0195
- 目的: Candidateの取り込みを、MMIを外しても読めるプロジェクト内JSONとして記録し、完全一致・移動・変更を決定論的に区別する。

## 1. 基本原則

台帳は **原本の現在状態** と **過去に取り込んだ事実** を混同しない。

- Candidateの `fingerprint` は内容同一性の証拠であり、位置同一性ではない。
- `locator` は取り込み時点の source / sheet / range を記録する。
- 同じ fingerprint が別位置に現れても「完全一致」と示すだけで、自動的に同一の業務上の対象とは断定しない。
- 類似判定は研究層の別証拠であり、台帳の完全一致には使わない。
- 原本全体の `sourceDigest` が変わっても、Candidate fingerprint が同じなら内容は変わっていない。移動だけで再取り込みを要求しない。
- 台帳は原本を書き換えない。出力先と台帳だけを更新する。

## 2. 保存形式

既定ファイルはプロジェクトルートの `.mmi/import-ledger.json` とする。JSONは人と他ツールが読める通常形式で、MMI固有のバイナリDBを使わない。

```text
{
  "schema": "mmi.import-ledger/v1",
  "entries": [
    {
      "kind": "image",
      "fingerprint": {
        "algorithm": "sha256",
        "representation": "image-media-bytes-v1",
        "digest": "sha256:..."
      },
      "source": {
        "source": "./design.xlsx",
        "sourceDigest": "sha256:...",
        "sheet": "画面設計",
        "range": "D1:G6"
      },
      "output": "assets/0123456789ab.png",
      "conversion": {
        "method": "mmi.extract.image",
        "version": "1"
      },
      "confirmation": "extracted"
    }
  ]
}
```

`confirmation` v1 は `extracted` または `confirmed`。後者は人がLinked Candidateを確認した事実を記録するために予約する。

## 3. 照合状態

現在のCandidateと台帳entryの比較結果は次のいずれか。

| 状態 | 条件 | 意味 |
| --- | --- | --- |
| `unimported` | 同じ fingerprint がない | 未取込 |
| `exact` | 同じ fingerprint かつ同じ locator | 同じ内容・同じ位置 |
| `moved` | 同じ fingerprint だが locator が違う | 内容は同じ。位置が変わった、または同じ内容が別位置にもある |
| `changed` | 同じ source + sheet + range の過去entryがあり fingerprintが違う | 同じ位置の内容が変わった |

`moved` と同一画像の重複は機械的には区別できないため、表示上は「完全一致（別位置）」として扱う。自動除外は `exact` と `moved` の双方で可能だが、`moved` の根拠として元entryのlocatorを必ず示す。

`changed` は locator一致をfingerprint不一致より優先して表示する。これにより、Excel上で画像を差し替えた場合を検出できる。

## 4. CLI契約

- `mmi inspect <source> --unimported`: `exact` / `moved` を候補一覧から除き、`unimported` / `changed` を残す。
- `mmi inspect <source> --json`: Candidateごとに台帳照合結果を追加できる。既存フィールドは壊さない。
- `mmi extract`: 成功したCandidateを台帳へ追記または更新する。書き出しに失敗したCandidateは記録しない。
- 台帳が存在しない場合は空台帳として扱う。壊れた台帳は黙って無視せず診断する。

## 5. 更新規則

同じ `kind + fingerprint.representation + fingerprint.digest + output` のentryを再度取り込む場合は重複行を増やさず、最新locator/sourceDigestへ更新する。異なるoutputへ明示的に取り込んだ場合は別entryを許す。

出力ファイルが消えている場合、fingerprint一致だけで「取込済み」とは扱わない。台帳照合と出力存在確認を分離し、CLIは欠落を診断する。

## 6. v1で行わないこと

- 類似Candidateを自動的に取込済みと判定しない。
- sourceDigestだけでCandidate変更を判定しない。
- provider scoreを台帳の同一性判定へ使わない。
- 一括変換器固有の状態を埋め込まない（issue-0200で拡張する）。
- Excel関連リポジトリへ依存しない。MMI内のCandidate契約だけを使う。
