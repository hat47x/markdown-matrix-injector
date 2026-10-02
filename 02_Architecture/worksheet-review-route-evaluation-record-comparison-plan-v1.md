# Worksheet Review Route Evaluation Record Comparison Plan v1

## 1. 目的

comparison結果を見る前に、
「どの2 recordを、どの明示policyで比較するか」
をdirectional planとして固定する。

```text
Left Evaluation Record
          +
Right Evaluation Record
          +
Explicit Comparison Policy
          |
          v
Comparison Plan + planDigest
          |
          v
issue-0181 Comparison
          |
          v
issue-0183 Policy Result
```

## 2. Identity

plan identity:

- leftRecordDigest
- rightRecordDigest
- policy
- planDigest

comparison/resultはplan identityへ含めない。

## 3. Direction

comparison pairは順序付き。

A→BとB→Aは別plan。

理由は次のとおりです。
- issue-0182/0184 artifact filenameもdirectionを保持。
- future baseline/candidate semanticsをcallerが重ねる可能性がある。
- plan側で勝手にunordered pairへ正規化しない。

## 4. Policy binding

policyはissue-0183 validatorをsemantic authorityとする。

planDigestはpolicyを固定順tupleへ投影してhashする。

したがってJSON object key orderに依存しない。

## 5. Planned execution

runtimeで左右recordを再validateし、recordDigestがplanと一致することをcomparison生成前に確認。

一致後は次のとおりです。
- issue-0181 comparison生成
- issue-0183 policy評価

へ委譲する。

## 6. Noncompliance

policy違反はplan execution errorではない。

```text
plan valid
records match
comparison valid
policy result compliant=false
```

を正常なtyped outputとして返す。

## 7. planDigestの意味

planDigestはpredeclared comparison intentのcontent identity。

signature / trusted timestamp / authenticity proofではない。

## 8. 非責務

- comparison policyのdefault。
- better/worse。
- model/provider ranking。
- deployment approval。
- filesystem/database/cloud persistence。
- cryptographic signature。
- provider execution。
