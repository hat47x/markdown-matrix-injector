# ADR-0019: 生成AI時代のレガシー文書モダナイズ基盤としての製品価値とプロジェクト方針

- Status: Accepted
- Proposed: 2026-09-27
- Accepted: 2026-10-01
- Deciders: Human Sponsor、MMI Lead Agent
- Scope: 製品価値、モダナイズの境界、利用経路、中核概念、優先度、評価方法
- Related: [ADR-0012](ADR-0012-mission-redefinition-notation-as-governance-boundary.md)（正本参照規約）、[ADR-0016](ADR-0016-notation-first-input-assistance.md)（入力支援）、[ADR-0018](ADR-0018-cognitive-assistance-plane.md)（認知補助の境界）、[製品要求](../../00_Prompt/requirements.md)
- Supersedes: ADR-0012 の「製品の価値を表参照規約へ限定する」部分、および本ADRの旧 Proposed 案。MMI Notation v1、Read-only、Determinism、Containment、Stable diagnostics の規範は継続する。

## 背景

### レガシー文書は一括移行できない

SIerの設計資産には、Excel方眼紙、画面ダンプを貼ったExcel、Word、CSV、XML、JSON、独自テキストなどが長期間残る。これらには表だけでなく、画像、AutoShape、選択肢、階層・ツリー、箇条書き、注記、リンク、図形同士の関係、セル配置に暗黙化された意味が含まれる。

全面的な一括変換は、情報落ちとレビュー負担が大きい。一方で、旧文書を永久に人手で参照し続ける運用も、AIエージェントから扱いにくく、二重管理と転記ミスを残す。

必要なのは「レガシー文書を今すぐ捨てる」ことではなく、**レガシー文書を抱えたまま段階的にモダナイズし、いつ切り離しても困らない状態へ近づけること**である。

### 生成AIには、読めることより安全に使えることが必要

AIエージェントはExcelや文書を直接読めるようになったが、巨大ファイルの丸読み、暗黙構造の見落とし、転記、存在しないIDの生成、更新追従漏れは依然として起こる。AIが高性能になっても、出典、再現性、読み取り専用、構造の確定と推定の区別は外部の契約として必要である。

MMIが提供すべき価値は、AIそのものになることではない。**AIと人がレガシー資産を安全に理解し、必要な構造だけを近代的な文書へ移し、機械的に検証できる境界を提供すること**である。

### 軽量認知の役割

既存のstructured artifact、worksheet format、CPU範囲探索の研究では、汎用LLMへ全面委譲しなくても、表らしい領域、既知書式、曖昧性、候補範囲をローカルCPUで絞れることを確認してきた。

この能力は表検索だけに閉じず、レガシー文書の暗黙構造を「候補」として発見する軽量認知へ一般化する価値がある。ただしADR-0018どおり、認知結果は権威にならない。明示構造、推定構造、人が確認した構造を区別する。

## 決定

### D1. 製品価値

> **レガシー文書を残したまま、依存は減らせる。AIにも人にも扱いやすくし、最後はMMIからも離れられる。**
>
> MMIは、既存の業務文書・構造化データから再利用可能な情報単位と関係を読み取り専用で取り出し、Markdownを中心とするテキスト資産へ段階的に移行するためのモダナイズ基盤である。
>
> 表、画像、図形、ツリー、リストなどを候補として抽出し、軽量な認知支援で暗黙構造を見つける。確定した構造は決定論的なAuthority Planeで検証・参照・展開する。移行途中は元文書を正本または根拠として保持でき、移行後は標準的なMarkdown・画像・構造化データへ実体化して、元文書やMMIを外しても成果物が成立する状態を目指す。

既存の「AIが書いても、人が書いても、表は正本どおり」は重要なユースケースとして残すが、製品価値全体を表参照へ限定しない。

### D2. モダナイズは3状態を扱う

MMIは一括置換ではなく、同じプロジェクト内で次の状態を混在可能にする。

| 状態 | 意味 | 主な用途 |
| --- | --- | --- |
| Linked | レガシー原本を残し、必要な断面を参照する | 既存MMI記法、変更追従、二重管理の抑制 |
| Extracted | 原本から表・画像・ツリー等を標準資産へ取り込み、出典と対応を残す | Markdown化、assets化、段階移行 |
| Detached | 必要情報が標準資産へ実体化され、原本をアーカイブ・削除しても文書が成立する | レガシー依存の解消、長期保守 |

プロジェクト全体を一度にDetachedへ移す必要はない。シート、範囲、画像、章などの単位で段階移行できることを重視する。

### D3. 「いつでも切り離せる」を製品要件にする

ロックインを避けること自体を価値とする。MMI固有機能を利用していても、最終的に次を出力できることを目標とする。

- 標準Markdown
- 通常の画像・添付ファイル
- JSON / YAML / CSV等の一般的な構造化データ
- 出典・変換条件・ダイジェストを記した可読なmanifest
- MMI記法を展開済みにしたmaterialized文書

将来の `detach check` は、未展開参照、未取込資産、原本にしか残っていない必須情報、壊れたリンクを列挙し、「原本を外しても成立するか」を機械的に確認する。

**MMIを使い続けることを成功条件にしない。安全にMMIを外せることも成功条件とする。**

### D4. Source AdapterとSemantic Candidateを中核概念にする

入力形式とMarkdown出力を直接1対1で結ばない。

```text
Legacy / Structured Sources
        ↓
Source Adapter
        ↓
Observed Structure
        ↓
Candidate Detection / Structuralizer
        ↓
Semantic Candidate Graph
        ↓
Confirm / Reference / Extract
        ↓
Markdown / assets / structured data
```

初期のCandidate種別は次を想定する。

- Table / Range
- Image / Screenshot
- Shape / Text box
- Diagram / connected shapes
- Tree / hierarchy
- Choice list / list
- Note / comment
- Link
- Section / heading structure

候補型はExcelオブジェクト型と同一視しない。たとえばTreeは、JSON/XMLの明示的ネスト、Excelのインデントや行グループ、番号体系、親列、AutoShape接続、フラットテキストの見出し番号など複数の入力から得られる。

### D5. データソースを表形式へ限定しない

既存のCSV、TSV、Excel、XML Spreadsheet 2003に加え、設計上は次をSource Adapterの候補とする。

- 汎用XML
- JSON / YAML
- インデント・番号・接頭辞などで構造を表したテキスト
- 画像・図形を含むOffice文書
- 将来の他形式

ただし、**対応予定と実装済みを混同しない。** 現行MMI Notation v1の適合範囲は従来どおりであり、新Source AdapterやCandidateは個別の受入条件と検証を通して追加する。

### D6. 明示構造と推定構造を分ける

JSON/XMLの親子関係のように形式自身が持つ構造と、Excel配置やフラットテキストから推定した構造を同じ確度で扱わない。

Candidateは少なくとも次を区別できるようにする。

- `observed`: 原形式に明示された構造
- `inferred`: 規則または認知処理で推定した構造
- `confirmed`: 人または決定論的検証で採用が確定した構造

推定にはmethod、evidence、provider/version、confidenceまたはreason code、provenanceを残し、曖昧な場合はabstainする。認知機能のON/OFFでAuthority Planeの事実を変更しない。

### D7. 軽量認知を「構造発見」の中核能力として育てる

Cognitive Assistance Planeは付加的なAI機能ではなく、レガシー文書の暗黙構造を低コストに候補化する中核能力として扱う。ただし権限はADR-0018のままとする。

優先順は次のとおり。

1. 決定論的parser / metadata / layout規則
2. ローカルCPUで動く疎表現・類似検索・bounded classifier
3. 必要箇所だけを扱う外部またはローカルLLM（明示opt-in）

汎用LLMへ最初から全文を渡すことを既定経路にしない。規則で確定できる部分は規則で処理し、曖昧な部分だけを候補化する。

### D8. 取り込み済み資産をプロジェクト単位で追跡する

選択的取り込みでは、同じ画像・表・構造を繰り返し候補に出さないことが実務上重要である。

プロジェクトは、source locator、content fingerprint、candidate type、出力先、参照元、変換条件、確認状態をmanifest/indexとして保持できるようにする。候補表示では少なくとも次を選択可能にする。

- すべて
- 未取込のみ
- 完全一致の取込済みを除外
- 類似候補も含めて確認

fingerprintの方式は候補型ごとに異なってよい。完全一致と類似判定を同じ証拠として扱わない。

### D9. 初回一括変換と継続的な個別取り込みを分ける

モダナイズ開始時には、一括変換が有効な場合がある。既存の変換器を再利用して標準Markdownの土台を作り、その後MMIが候補、出典、重複、構造関係、参照保証を補う構成を許容する。

一方、継続運用では個別取り込みを重視する。

```text
初回:
legacy documents
  → baseline conversion
  → candidate review
  → Markdown + assets + manifest

継続:
legacy source update
  → unimported / changed candidates
  → selective reference or extraction
  → validation
```

特定の一括変換ライブラリを製品価値の前提にはしない。MarkItDown等はAdapterまたは補助変換器として評価できるが、MMI固有の出典・空間関係・候補状態・detachabilityを失わないことを優先する。

### D10. プラグインではなく、共通エンジンを製品の中心にする

VS Code拡張は重要な人間向けクライアントだが、MMIそのものではない。製品の中心を、エディタに依存しないエンジンと契約に置く。

| 提供面 | 役割 |
| --- | --- |
| Core engine / library | Adapter、Candidate、Authority検証、参照、展開、manifest |
| CLI | 人・AI・CIから同じ機能を呼ぶ標準入口 |
| Machine-readable contracts | schema、diagnostic code、manifest、conformance corpus |
| Agent integration | skill / instructions、将来のMCP等。AIが安全にinspect/check/extractできる入口 |
| VS Code extension | 人が候補を確認・採否し、参照・取込・レビューするUI |
| Converter integration | 初回一括変換や外部出力器との接続 |

新能力は原則としてCoreへ実装し、VS Codeだけに閉じた機能を増やさない。

### D11. AIエージェントを第一級利用者とする

AIが巨大な原本を丸読みせず、次の操作を機械的に行えることを目標とする。

1. sourceをinspectして構造と候補を知る
2. 未取込・変更候補を絞る
3. candidateを参照またはextractする
4. 出力をcheckする
5. provenanceとmanifestを確認する
6. detachabilityを検査する

人向け表示とAI/CI向けJSONを同じエンジンから提供する。AIが生成した推測を原本事実へ昇格させず、診断コードとprovenanceで自己修正できるようにする。

### D12. 保証の境界

継続する保証:

- Read-only: sourceを書き換えない
- Determinism: Authority Planeの同じ入力・設定から同じ結果
- Containment: 許可範囲外を暗黙に読む・送ることをしない
- Visible failure: 非対応・曖昧・不在を隠さない
- Provenance: どこから何を得たかを追跡可能にする
- Abstention: 推定できないものを既知構造へ強制しない

MMIは、文書内容の業務的正しさそのものを自動保証しない。認知支援は候補を示し、決定論的検証と人または利用者が選んだAIによるレビューを組み合わせる。

## 製品の優先度

### 優先度1: CoreとAIから使える入口

- CLIの最小経路: inspect / check / render / manifest
- Candidate / Source Adapterの共通契約
- AI向け指示パックとmachine-readable output
- 現行表参照機能をCore経由へ寄せる

### 優先度2: レガシー文書モダナイズの最小縦切り

Excelを最初の実証対象とし、表に加えて画像を扱う。

- Excel埋め込み画像の列挙、anchor、source mediaの保持
- 画像の抽出とMarkdown assets化
- プロジェクト内の取込済み判定
- 表と画像の位置関係
- 初回一括変換と個別取り込みの両経路
- 人が候補を採否できるVS Code UI

次にShape、Tree、Choice listへ広げる。

### 優先度3: Source Adapterの一般化

- JSON / XMLの明示ツリー
- フラットテキストのStructuralizer
- CSV/Excelの親列、番号、インデント等からの階層候補
- observed / inferred / confirmedの共通モデル

### 優先度4: Detachabilityと長期運用

- materialize / detach check
- provenance manifest
- 変更検出、未取込・再取込候補
- 参照台帳と影響分析
- 原本をアーカイブするための検証手順

### 優先度5: 組織導入

- SIer文書キット
- CI関門
- 標準的なモダナイズ手順
- 大規模既存資産での評価

## 評価指標

従来の「表が正本と一致するか」に加え、次を追う。

1. 既存文書から有用なCandidateを見つけられた割合
2. inferred candidateの採用・修正・却下率
3. 既に取り込んだ資産を再作業した件数
4. レガシー原本への手動参照回数の減少
5. Linked → Extracted → Detachedへ移せた情報単位の割合
6. detach check後に原本を外して発生した欠落件数
7. AIがmanifestとdiagnosticsだけで修正できた割合
8. 外部AIを使わずローカルで完結できた候補抽出の割合
9. 利用者が価値確認を済ませたモダナイズシナリオ数

速度だけをKPIにしない。**依存を減らしながら、情報欠落と誤確定を増やさないこと**を主な成功条件とする。

## 受け入れるトレードオフ

- 対象形式と候補種別が増えるため、単純な表参照ツールより設計範囲は広がる。
- 全形式を一度に対応せず、Candidate contractとprovenanceを先に固定して縦に広げる。
- 軽量認知を中核に置くが、自動確定率を最大化しない。曖昧な場合に止まることを品質とみなす。
- 元文書を長期間併存できる設計は移行完了を遅らせる可能性があるが、big-bang移行の失敗リスクを下げる。
- MMIから離脱可能にするため固有形式への囲い込みは避ける。これは継続利用率だけを見れば不利だが、企業文書の基盤としての信頼性を優先する。

## 採択後の作業

1. [製品要求](../../00_Prompt/requirements.md)を本ADRに合わせて改訂する。
2. [現在の作業](../README.md)から「採否待ち」を外し、優先度を本ADRへ合わせる。
3. AGENTS.md等の入口では、現行実装と将来の製品範囲を混同しない形で説明する。
4. 既存研究ブランチを新しいCandidate / Structuralizerの考え方へ対応付け、重複研究を増やさない。
5. 実装Issueは、Core契約とExcel画像の最小縦切りから起票する。