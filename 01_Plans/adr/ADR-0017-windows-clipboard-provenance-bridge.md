# ADR-0017: Excelコピーの出所をOSクリップボードから取得するか

- Status: Accepted（2026-09-25: 選択肢2を設定付き・既定オンで採用、実装・実機検証済み。下記「採用と実装」）
- Date: 2026-09-10（2026-09-11: VS Code観測完了により選択肢1を却下、Context/Decisionを確定内容へ更新）
- Scope: 入力支援（貼り付け）、配布、対応環境

## Context

Excelの選択範囲をMMI参照として貼り付けるには、原本のパス・シート名・開始セルが必要である。[観測](../../02_Architecture/input-assistance-paste-provenance.md)で次を確認した。

- Excelは範囲コピーで22のクリップボード形式を公開し、原本の住所は`Link`（ANSI、`Excel`/`<dir>\[book]sheet`/`R5C3:R12C6`）と`Object Descriptor`（UTF-16、`sheet!R5C3:R12C6`）に含まれる。
- `HTML Format`はヘッダに`SourceURL`（絶対パス、UTF-8、パーセント符号化）を持つが、本文にセル住所は一切含まれない。 得られるのは形状と表示値だけである。
- したがって`HTML Format`だけでは開始セルを決められない。現行の`inferRangeFromHtmlTable`が常に`A1`起点を返すのはこの制約による。

`Link`と`Object Descriptor`はWindowsに登録された私的形式であり、VS CodeのDocumentPasteEditProviderが受け取る`DataTransfer`に現れるかが未確認だった。2026-09-11、VS Code 1.137.0（ローカル、`remoteName: null`）へ実際に`registerDocumentPasteEditProvider`を登録し、実Excelから`状態遷移!C5:F12`をコピーして`provideDocumentPasteEdits`を呼び出させて確認した（[観測](../../02_Architecture/input-assistance-paste-provenance.md)§2）。

結果: `DataTransfer`が公開するMIME型は`text/plain`・`text/html`・`text/rtf`・`image/png`の4件のみ。 `Link`・`Object Descriptor`等は`pasteMimeTypes`へ明示登録しても一切現れなかった。さらに、`text/html`の内容そのものがOSクリップボードの生バイトとは異なり、CF_HTMLヘッダー（`Version:1.0`・`StartHTML:`・`SourceURL:`等）はVS Code／Electronのクリップボード正規化で除去されている。原本のパスも、シート名・住所も、`DataTransfer`からは一切取得できない。 観測用の拡張とスクリプトは[clipboard-probe](../../03_Implement/scripts/clipboard-probe/README.md)にあり、`probe-vscode.ps1`で再現できる。

選択肢は3つあった。

1. `DataTransfer`に出所形式が含まれる。拡張内だけで完結する。→ 却下（確認済み、上記）。
2. 含まれない。拡張ホストから補助プロセスを起動してOSクリップボードの生バイトを読む（Windows専用）。
3. 出所を使わず、内容照合と利用者指定だけで成立させる。

## 採用と実装（2026-09-25）

利用者の判断により選択肢2を採用した（設定`markdownMatrixInjector.paste.useClipboardSource`、既定オン、ローカルWindowsのみ）。下記の固定した制約をすべて守る。

- **読み取り:** OS標準のPowerShellが`media/clipboard/read-clipboard.ps1`を実行し、1回の`OpenClipboard`で`HTML Format`・`Object Descriptor`・`CF_UNICODETEXT`の生バイトを読む（再試行は50ms×10回まで）。ネイティブアドオンの追加コンパイルやインストールは無い。初回だけ起動に約2.5秒かかるため、Markdownを開いた後に裏で起動しておき、以後の読み取りは4〜5ms（実測）。読んだ内容は保持しない。数分使わなければ終了する。
- **復号:** パスは`SourceURL`（UTF-8）、シートと住所は`Object Descriptor`の`szSrcOfCopy`（UTF-16、宣言済みオフセットを境界検査して読む）。`Link`は使わない。行だけ・列だけのR1C1（`C3:C4`等）は拒否する。
- **照合（3条件すべて）:** (1) 補助プロセスが読んだテキストが、VS Codeがこの貼り付けで受け取ったテキストと一致する（別のコピーではない）。(2) 保存済みの原本をその住所で読んだ表示値が、コピーした値と完全に一致する。(3) ブックがワークスペースのフォルダ内にある。1つでも満たさなければ出所は使わず、内容照合へ落とす。
- **提示:** 条件を満たした出所は「コピー元を確認済み」として`Paste As`のドロップダウンと`MMI: コピーした範囲と同じ内容の表を探して参照を挿入`の候補の先頭に出す。同じ位置の内容照合の候補は重ねない。**自動確定はしない**（通常のCtrl+Vには組み込まない）。
- **実機検証（実Excel、COM操作、一時フォルダ）:** `設計_한글.xlsx`（日本語と韓国語を含む名前）の`状態遷移!C5:F12`（空セルを1つ含む）をコピー → `設計_한글.xlsx#状態遷移|C5:F12`を正しく復元し、照合も通過。ワークスペース外のブック、別の貼り付け内容は拒否。**オートフィルターで行を隠したコピー（住所はC5:F12、内容は7行）と、未保存の変更を含むコピーはいずれも拒否された。**
- **対応外:** リモート環境（WSL・SSH・Codespaces・web）、Windows以外、未保存のブック（照合で拒否され内容照合へ）。

## Decision

選択肢1は却下が確定した。 出所を得る手段は選択肢2（Windows補助プロセス）に限られ、それを避けるなら選択肢3（内容照合のみ）となる。選択肢2を実装するか否かは、本ADRでは決定しない。 配布・保守・リモート開発非対応という「Bad」（下記）を負ってまで出所取得の速度・精度を上げる価値があるかは、実装着手時にあらためて判断する。

- 選択肢2を実装する場合の設計・制約は下記のとおり固定する。ネイティブアドオンを新たにコンパイルせず、OS標準の実行環境で生バイトを読んで拡張へ返す。
- 選択肢2の採否によらず、選択肢3の経路を必ず実装する。 出所を得ても証明として扱わない設計（下記）のため、内容照合はどちらを選んでも必須の土台であり、選択肢2は候補生成を速く・確実にする追加手段に過ぎない。issue-0114の作業D（内容照合＋明示候補選択の最小貼り付け）は選択肢2の可否を待たずに着手できる。

橋渡しを採る場合の制約を先に固定する。

- `vscode.env.remoteName`が設定されている環境（WSL・SSH・Codespaces・web）では使用しない。拡張ホストとクリップボードが別の機器にあるため、読み取っても別の内容になる。
- Excelを操作しない。生バイトの読み取りだけを行う。現在アクティブなExcelの`Selection`をコピー元と決めつけない。
- `DataTransfer`との突き合わせを必須とする。 `DataTransfer`はVS Codeが貼り付け時点で取ったスナップショットだが、補助プロセスは実行時点のクリップボードを読む。両者のHTMLの形状と表示値が一致しなければ出所を破棄する。一致しても同じコピーとは限らないため、初期提供では候補の明示選択を必須とする。
- `OpenClipboard`は`ERROR_ACCESS_DENIED`で失敗し得る（数分続く状態を観測した）。再試行に上限を設け、失敗しても貼り付け操作を止めず、内容照合か通常貼り付けへ落とす。
- 形式ごとに符号化が異なる。パスは`SourceURL`（UTF-8）から取り、シート名と住所は`Object Descriptor`（UTF-16）から取る。`Link`のパスはANSI符号化でファイル名を壊すため使わない（`設計_한글.xlsx` → `設計_??.xlsx`を確認）。

出所を得ても、それを証明として扱わない。 フィルターで行が隠れたコピーでは、住所が3行分を指すのに内容は2行しかない状態を観測した。取得経路にかかわらず、原本を読んで形状と表示値を照合してから挿入する。

## Consequences

- **Good:** 保存済みブックからの通常のコピーでは、開始セルを推測せずに`C5:F12`のような正しい参照を1操作で挿入できる。初期提供では候補選択を省略しない。
- **Good:** 出所が取れない環境でも内容照合の経路が残るため、機能が消えるのではなく手数が増えるだけになる。
- **Bad:** Windows専用の経路が増え、リモート開発環境では動作しない。対応条件の説明と実機検証の対象が増える。
- **Bad:** 補助プロセスの起動遅延が貼り付けの応答に乗る。測定して上限を決める必要がある。
- **Bad:** クリップボードの生バイトを扱うため、扱う情報の範囲と保持しないことを明示する必要がある。索引と異なり永続化しない。

## Traceability

- Related Issues: [issue-0114](https://github.com/hat47x/markdown-matrix-injector/issues/495)
- Related ADR: [ADR-0016](ADR-0016-notation-first-input-assistance.md)
- Related Docs: [クリップボード出所と照合](../../02_Architecture/input-assistance-paste-provenance.md)、[ソースモデル](../../02_Architecture/input-assistance-source-model.md)、[観測ハーネス](../../03_Implement/scripts/clipboard-probe/README.md)

実装条件は[設計レビュー](../input-assistance-design-review.md)のR1/R4。Object Descriptor全体の文字列検索を製品実装に使用しない。
