# Deterministic Review Evidence Overlay v1

## 1. 目的

MMIには現在、human review（人による確認）のために、役割の異なる複数の情報源が存在する。

```text
Authority Plane
  deterministic source / parser / resolver / preview checks

Cognitive Perception
  provider-neutral candidate ranking / ambiguity / novelty

Cognitive Judgment
  optional proposal-only bounded judgment

Worksheet review telemetry
  deterministic comparison-derived review reasons
```

最後のreview telemetry（比較によって得られた確認理由の記録）を、他の3つと混同せずに提示するためのcontract（扱いを定める契約）が本overlay（情報を別枠で添える仕組み）である。

## 2. なぜCognitive Signalにしないのか

fill review reason（塗りつぶし情報による判定差を説明する理由）は、Fly provider（認知処理の提供元）が生成したsignal（認知結果）ではない。

たとえば、次のreasonがある。

```text
fill-induced-ambiguity
```

これは、次の2つの結果を

```text
structure-only matcher result
vs
structure+fill matcher result
```

決定論的に比較して得たものである。provider capability（提供元が宣言した能力）でも、推論結果でもない。

これをCognitive Perception（認知による候補の認識結果）へ含めると、次の問題が生じる。

- provider provenanceが不正確になる
- matcher resultとmeta-analysisが同じ層になる
- 将来別providerへ切り替えたとき意味が曖昧になる

このため、review telemetryは別の情報として扱う。

## 3. なぜAuthority checkにしないのか

Authority check（適用前の決定論的な再検証）には、次の項目がある。

- source identity
- profile compatibility
- parser
- parameter schema
- resolver
- containment
- source existence
- preview

のように、実行可否に必要な決定論的再検証である。

一方、次のreasonはそれらと異なる。

```text
fill-supported-acceptance
fill-changed-winner
```

これらはmatcher（書式の照合処理）の判断を説明する情報であり、Authorityのpass/fail（検証の成否）ではない。

したがって、Authority receipt（再検証の結果を記録するもの）にも含めない。

## 4. Artifact構造

```text
DeterministicReviewEvidenceV1
├─ source identity
├─ worksheet feature/profile provenance
├─ deterministic producer identity
├─ reasons
└─ paired comparison summary
```

### Producer

```text
kind: deterministic-analysis
componentId: mmi.experimental.worksheet-format-fill-review
componentVersion: 1
executionBoundary: local
```

このproducer（記録の生成主体）の識別情報は、外部providerの識別子ではない。

## 5. Reason role

### review-relevant

decision boundary（判定の境界）やcandidate identity（候補の識別）に影響した事実を示す。

また、候補の識別に必要なevidence（根拠情報）が取得できない事実も含む。

### diagnostic-only

fill unavailable（塗りつぶし情報を利用できない状態）やtone disagreement（色調の不一致）のように、それ単独ではreview requirement（確認が必要な条件）として弱い事実を示す。

この区分は、issue-0139/0140のnoise（確認の妨げになり得る情報）の評価に基づく。

## 6. Perception binding

artifact（確認用の根拠データ）のprimary path（主となる比較結果）は、Cognitive Review Envelope（認知結果を束ねたデータ）に含まれるFly Perception結果と一致しなければならない。

```text
primary fill-aware result
       |
       | exact match
       v
Fly Perception payload
```

照合する項目は次のとおり。

- classification
- winner
- novelty
- candidate order
- candidate scores
- source profile
- feature version

これにより、review reasonが別のmatcher run（照合処理の実行結果）に由来するものへ取り違えられることを防ぐ。

## 7. Surface構造

既存schema（データ構造の定義）は変更しない。

```text
DeterministicReviewEvidenceSurfaceV1
├─ surface
│  ├─ Cognitive review
│  └─ Authority verification
└─ deterministicReviewEvidence
```

proposal identity（適用提案の識別情報）を持つ既存surface（確認向けのデータ）でも、reviewとAuthority boundary（適用前の検証境界）を保つ限り、同じwrapper concept（既存データを包む方式）を使える。

## 8. Apply authority

このoverlayは次の状態を変更しない。

```text
writeAuthority = none
applyStatus = not-authorized
```

review-relevant reason（確認に関係する理由）が1件以上あっても、自動的な拒否を意味しない。

reasonが0件でも、自動的な承認を意味しない。

Authorityがsatisfied（再検証を満たした状態）でも同じである。

## 9. Privacy / payload

artifactには、次の情報を含めない。

- raw worksheet cells
- raw feature vector
- workbook bytes
- raw Notation
- evaluation fixtureのexpectedReview
- provider prompt
- external model payload

人によるreviewに必要な要約だけを保持する。

## 10. 将来の一般化

現行のproducerはworksheet-format fill comparison（ワークシートの書式と塗りつぶし情報の比較）専用である。

将来、次のようなreason family（確認理由の種類）を扱う場合がある。

- multi-family drift
- snapshot drift
- balance boundary

これらを同じsurfaceへ載せる場合も、すぐにgeneric reason engine（汎用の理由生成処理）へ統合しない。

各reason familyについて、次の事項を確認する。

1. deterministic derivation
2. noise評価
3. provenance
4. review relevance

が確立してからproducerを追加する。

surface contract（表示データの契約）はproducer-neutral（生成主体に依存しない形）へ拡張可能だが、reason semantics（確認理由の意味）まで早期に一般化しない。


## 11. Source identityとの責務分離

source identity（参照元の同一性）については、issue-0152の`source-file-bytes-v1`がcanonical primitive（共通の基礎となる定義）である。

本overlay自体は次の処理を行わない。

- bytesをhashしない
- pathをresolveしない
- containmentを判定しない
- byteLengthを再計算しない

Envelope / verified surface（検証済みの確認データ）へ既にbinding（関連付け）された`sourceDigest`を比較するだけとする。

将来、Cognitive Observation builder（認知用の観測データを作る処理）がissue-0152のprimitiveを直接使うようになっても、このoverlayの責務は変えない。
