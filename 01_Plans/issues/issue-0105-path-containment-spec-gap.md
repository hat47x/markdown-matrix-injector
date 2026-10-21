# Issue: パス封じ込めの仕様準拠ギャップと是正記録

この文書は当時のIssue記録です。2026年7月15日の発見経緯と、当時のパス境界・シンボリックリンク対策、Problemsパネル統合を記録した文書です。現在進行中のPR #628は関連実装を変更していますが、本清書ではそのPRの成果を取り込んだり現行実装の成立を断定したりしません。

## Meta
- Type: Bug
- Status: Done
- Priority: High
- Completed: 2026-07-15
- Scope: 03_Implement/src/core/pathResolver.ts, 03_Implement/test（新規封じ込めテスト）, 04_Documentation/spec/mmi-notation-v1.md（必要なら文言精緻化）, reference.md
- Expected verification level: unit（遡上拒否の正常系/異常系）+ conformance corpus追加

## Traceability
- Related Backlog/Phase: requirements.md Phase 12（MMI Notation規範の実装準拠）
- Related ADR/Spec: `04_Documentation/spec/mmi-notation-v1.md` §2 P4 / §4（Containment MUST）, ADR-0012 D3-4
- 発見経緯: `manual-e2e-g3-g4-result-2026-07-15.md` の事実検証中、初版証跡の「resolverはworkspace root逸脱を拒否する」という記述が実装と不一致であることを確認（記述側は訂正済み）

## 背景
仕様 `mmi-notation-v1.md` はP4として「パス解決はワークスペース境界内に限定する (resolution MUST stay
within the workspace boundary)」を規範化している。しかし現実装の `resolveSourcePath()` は
「Markdown相対 → workspace相対」の順に `fs.existsSync` で解決するだけで、**`..` セグメントによる
境界外への遡上を拒否する検査を持たない**。例えば `![[../../../../etc/hosts]]` や
`![[..\\..\\secrets.csv]]` は、対象が存在すれば読み取られ描画される。

read-only性質（G3）は保持されるため情報の書き換えは起きないが、**ワークスペース外ファイルの内容が
プレビューへ表示される**のは、企業統制が仕様を根拠に承認する前提（ADR-0012議事録: セキュリティ統制
ステークホルダーの要求）を裏切る。仕様準拠ギャップとして是正する。

## 当時の実行計画
### 解決方針（当時の提案）
1. `resolveSourcePath()` に封じ込め検査を追加する。
   - 解決候補それぞれについて `path.resolve` 後の実パスが、許容境界（workspaceRootがあればその配下、
     なければMarkdownファイルの属するディレクトリ木＝保守的にmarkdownFilePathの親）に
     `path.relative` ベースで包含されることを検査する。
   - 境界外は候補から除外し、全滅時は既存の「Unable to resolve source file」に**理由を付した**
     エラー（例: `outside workspace boundary`）で失敗させる（P2可視劣化と両立）。
2. workspaceRoot未指定時の境界定義（Markdown親ディレクトリまでか、その祖先をどこまで許すか）は
   実装時に仮想ステークホルダー会議で確定し、spec §4に反映する（相対参照 `../data/x.csv` の
   正当な利用を壊さないこと — 既存fixture/corpusは `../data/` 参照を多用している点に注意）。
3. unit: 正常系（`./x.csv`, `../data/x.csv` が境界内で解決）/ 異常系（境界外遡上が拒否され
   可視エラーになる）を追加。conformance corpusに封じ込めケースを1件追加。
4. `reference.md` / specのContainment記述を実装後の事実に合わせて最終化。

### 受入条件（Acceptance criteria）
- [x] 境界外への `..` 遡上が拒否され、mmi-errorとして可視化される。
      実装: `src/core/pathResolver.ts` の `isPathWithinBoundary()` + `PathContainmentError`。
      `path.relative` ベースの境界検査、`fs.realpathSync` によるシンボリックリンク迂回対策込み。
      `markdownMatrixPlugin.ts` の既存generic catchを通り `mmi-error` として可視化（P2準拠、
      新規コードパス不要）。
- [x] 既存の正当な相対参照（`../data/...` を含む既存テスト・corpus全件）が回帰しない
      （**213 tests全体pass**、`pathResolver.test.ts` 10 tests: 正常系3・境界外拒否3・シンボリックリンク2・
      no-workspaceRoot時2）。
- [x] spec §4と実装の記述が一致する（P4 Containment MUSTの実装根拠がテストでトレース可能）。
- [x] conformance corpusに封じ込めケースを追加（`containment-rejects-traversal-outside-boundary`,
      `test/conformance/cases.json`、`../../../../../../../etc/hosts` 参照が `mmi-error` +
      `outside workspace boundary` を含むことを検証）。
- [x] `npm run build` / `npm test` pass（213 tests, phase9 sync OK, guide-sync OK）。

### Problems パネル統合（追加実装、当初 Follow-up 想定だったが本 issue 内で解消）
`03_Implement/src/dx/diagnostics.ts` に安定診断コード `MMI_PATH_OUTSIDE_BOUNDARY` を追加し、
`vscodeAdapters.ts`（`createDiagnosticsForDocument`）が `pathResolver.ts` の `isPathWithinBoundary`
（export化）を再利用して事前チェックする形で統合済み。境界外参照は**プレビュー描画前のProblemsパネル**
でも検知される（`fileExists && containmentOk === false` の時のみ発火、ファイル不在時は
`MMI_FILE_NOT_FOUND` が優先し二重報告しない）。`test/diagnostics.test.ts` に4テスト追加
（発火・非発火・ファイル不在優先・後方互換undefined）。

### 当時の検証計画（Validation plan）（実績）
- `npm run build` / `npm test`: 213 tests pass, phase9 sync OK, guide-sync OK
- `python3 01_Plans/tools/planning_queue.py`: orphan 0を確認
- 手動: `../../../../../../../etc/hosts` 参照が `mmi-error`（`outside workspace boundary`）を返すことを
  conformance corpusで機械検証（`pathResolver.test.ts` の同種テストと合わせ二重に固定）
