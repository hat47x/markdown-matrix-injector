# Contained Jev Worksheet Review Entrypoint v1

## 1. 目的

MMI固有のJev review-route（Jevによる確認経路の判断）を、呼び出し側で設定できる範囲を増やさずに、contained review workflow（許可範囲内の参照元を扱う確認処理）へ接続する。

```text
Contained source
 -> stable Perception
 -> canonical review-route Observation
 -> issue-0165 fixed Jev route provider
 -> proposal-only Judgment
 -> deterministic + Authority
 -> UnifiedHumanReviewViewModelV1
```

## 2. Caller configurable surface

caller（呼び出し側）が指定できる項目は次のとおり。
- source/proposal context
- approved Format Profiles
- `allowExternalJev: true`
- model id
- provider id
- test/host supplied transport

同じAPI（呼び出し口）では、次の項目をcallerから指定できない。
- custom Choice question
- custom criteria
- custom Jev state projector
- arbitrary provider in this convenience API

provider（判断処理の提供元）や質問を個別に選ぶ用途では、issue-0163のgeneric API（汎用の呼び出し口）を使う。

## 3. Consent first

Jev専用entrypoint（処理の入口）は外部providerを使うための境界なので、`allowExternalJev: true` が指定されなければsource snapshot（参照元から読み取る一時データ）も読まない。

これは、provider opt-in（外部provider利用の明示的な同意）の確認前にローカルsource（参照元）を読み込むことを防ぐための追加の防御である。

後段ではissue-0161のexternal-opt-in gate（外部provider呼び出し前の同意確認）も維持する。

## 4. Transport remains injected

ここで受け取るtransport（通信などの呼び出しを委譲する接続口）は、network implementation（ネットワーク処理の具体的な実装）そのものではない。

このIssueでは次の機能を追加しない。
- fetch
- Authorization header
- API key
- retry
- timeout
- live test

## 5. Review semantics

inspect / routine（Jevが返す確認経路の選択肢）のどちらについても、次の制約を維持する。
- human review required
- apply authority none
- automatic decision none

最終view model（人による確認向けの表示データ）におけるAuthority（適用権限を判定する側）の `review-only / no-write / not-authorized` 境界を変更しない。

## 6. 非責務

- provider availability policy
- production config
- secrets
- threshold
- automatic routing without review
- UI rendering
