# Issue: source参照の影響範囲をread-onlyで列挙する

## Meta
- Tracking: issue-0213（issue-0207はsearch demand observation（#473）、issue-0208はcognitive cultural explorationが使用中のため、本Issueは0213とする）
- Type: Feature
- Status: In Progress
- Priority: Medium
- Scope: src/application（source impact）、src/cli、docs
- Expected verification level: unit / integration

## Traceability
- Related ADR/Spec: ADR-0019 D2・D3・D13、issue-0195（取り込み台帳）、issue-0196（Detached）
- Product requirement: Linked / Extracted / Detachedをまたいだ安全な変更・削除判断
- Dependency: 既存MMI parser、Extracted provenance、workspace containment

## 背景

MMIはLinked参照、Extracted資産、Detached成果物を情報単位で併用できる。一方、source workbook / CSV / Tree sourceを変更・移動・削除する前に、そのsourceへ依存するMarkdownを横断して確認する入口が無かった。

Delivery ManifestはSmart Fallbackで別紙になる参照だけを対象とするため、通常のLinked表、採用済みExtracted画像・表・Tree、sourceそのものへの通常Markdownリンクを一括して答えられない。

最初から永続索引DBを追加すると、索引のfreshness自体が新しい管理対象になる。v1は現在のMarkdownをread-onlyで走査し、文書を正本として影響を返す。

## Acceptance criteria

- [x] `mmi impact <source> --root <workspace>`で、workspace内Markdownから対象sourceへのMMI Linked参照を列挙する。
- [x] `mmi:extracted` / `mmi:extracted-table` / `mmi:extracted-tree` provenanceを再利用し、文書へ採用済みのExtracted依存を同じ結果へ含める。
- [x] 通常Markdownのローカルリンクが対象sourceを指す場合も列挙する。
- [x] code fence内の例示、HTTP等の外部URL、別sourceへの参照は影響として数えない。
- [x] sourceが存在する場合はworkspace containmentとrealpathを使い、digestも返す。sourceが既に削除済みの場合も旧パスで検索でき、結果を`path-only`として明示する。
- [x] source pathがworkspace外へ出る場合は、存在しないpathやsymlink parentを含めてfail-closedにする。
- [x] text / JSONの両出力を提供し、文書・source・ledgerを変更しない。
- [ ] unit / CLI integration testを通常の開発環境で実行し、結果を記録する。

## Implementation checkpoint (2026-10-08)

`src/application/sourceImpact.ts`へ`mmi.source-impact/v1`を追加した。reportは対象sourceのworkspace相対path、存在有無、存在時のSHA-256、走査Markdown数、relation別件数、impact recordsを返す。

impact relationは次の3種類に限定する。

- `linked`: `![[...]]`のMMI参照。
- `extracted`: issue-0196と同じExtracted provenance parserで確認できる、文書へ採用済みの画像・表・Tree。
- `local-link`: 通常Markdown link / image linkがsourceそのものを指す場合。

既存の`detachFreshness.ts`からExtracted provenance parser、`detachCheck.ts`からMarkdown local-link parserをexportし、同じ構文を別実装で再解釈しない。

source解決はMMI Linked参照だけ既存rendererと同じ「Markdown相対 → workspace root fallback」の順序を使う。存在する候補がある場合はその解決結果を正とする。sourceが既に削除されて全候補が存在しない場合だけ、旧pathとの一致を保守的な`path-only` evidenceとして残す。

missing sourceのcontainmentでは、単純な文字列pathだけを見ない。最寄りの実在親まで遡ってrealpathを取り、その先のmissing path segmentを戻す。これにより、workspace内のsymlink directoryから外部へ出る「まだ存在しないsource」もworkspace内と誤認しない。

CLIは`mmi impact <source>`とした。対象sourceが存在しなくてもexit 0で影響を返す。workspace外source、directory等の不正入力はusage errorとする。コマンドはread-onlyで、参照の書換えやsource移動を行わない。

`test/sourceImpact.test.ts`では、同じsourceへのLinked / Extracted / local-linkを1つのreportへ束ねること、code fenceと外部URLを除外すること、source削除後も3件を`path-only`で発見すること、workspace外sourceを拒否すること、CLI実行前後でworkspace file集合が変わらないことを固定した。

## Validation plan

通常の開発環境で次を実行する。

```sh
cd 03_Implement
node --import tsx --test test/sourceImpact.test.ts
npm run build
npm run mmi -- impact ../04_Documentation/samples/sier-design/masters/基本設計.xlsx \
  --root ../04_Documentation/samples/sier-design --json
```

実データでは、sourceを削除する前と一時退避した後で同じMarkdown dependencyが`resolved` → `path-only`へ変わり、件数が失われないことを確認する。

## Remaining work

- 正本test suiteを実行し、Linux/Windowsのpath semanticsを確認する。
- 実務workspaceで、source変更・移動・削除判断の前にimpact reportが十分かを観測する。
- 永続参照索引は、毎回走査の性能が実測で問題になった場合だけ検討する。索引を導入する場合もMarkdown/source provenanceを正本とし、stale indexをAuthorityにしない。
- 自動rename / reference rewriteは本Issueのv1対象外。影響を示したうえで人が変更を選ぶ。
