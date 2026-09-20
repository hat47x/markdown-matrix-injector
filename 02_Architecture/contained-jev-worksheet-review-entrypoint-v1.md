# Contained Jev Worksheet Review Entrypoint v1

## 1. 目的

MMI固有のJev review-routeを、設定自由度を増やさずcontained review workflowへ接続する。

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

許可:
- source/proposal context
- approved Format Profiles
- `allowExternalJev: true`
- model id
- provider id
- test/host supplied transport

禁止:
- custom Choice question
- custom criteria
- custom Jev state projector
- arbitrary provider in this convenience API

高度なprovider用途はissue-0163 generic APIを使う。

## 3. Consent first

Jev専用entrypointは外部provider用境界なので、`allowExternalJev: true` がなければsource snapshotも読まない。

これは「provider opt-inが後で失敗するまでローカルsourceを読む」挙動を避けるための追加防御。

issue-0161のexternal-opt-in gateも後段で残る。

## 4. Transport remains injected

transportはnetwork implementationではない。

このIssueで追加しない:
- fetch
- Authorization header
- API key
- retry
- timeout
- live test

## 5. Review semantics

inspect / routineはいずれも:
- human review required
- apply authority none
- automatic decision none

最終view modelのAuthority `review-only / no-write / not-authorized` 境界を変更しない。

## 6. 非責務

- provider availability policy
- production config
- secrets
- threshold
- automatic routing without review
- UI rendering
