---
title: 申請システム 基本設計書
subtitle: 申請・承認システム更改プロジェクト
documentNumber: SD-APP-0001
version: 第1.2版
date: 2026年10月21日
customer: 架空商事株式会社 御中
organization: 架空システムズ株式会社
classification: 社外秘
approvals: [承認, 審査, 作成]
cover: true
toc: true
---

## 改訂履歴

改訂履歴はExcelやCSVで管理している台帳をそのまま参照します。版を上げるときは台帳に1行足すだけで、この表も更新されます。

![[./data/revisions.csv#Sheet1|A1:F4?header=first&caption=表1　改訂履歴&id=revisions]]

## 1. レビューで残った項目

判定台帳から「要確認」の3件を表示します。

![[./data/release.csv#Sheet1|A1:F11?header=first&columns=A,B,C&grep=要確認&caption=表2　残件一覧&id=open-items]]

業務の流れは[表3の状態遷移](#workflow)で確認できます。

## 2. 状態遷移

![[./data/design.xlsx#状態遷移|A1:F13?header=first&caption=表3　状態遷移&id=workflow&pageBreak=before&orientation=landscape]]

状態遷移は12件です。表3は横向きのページに置きます。

## 3. 別紙

![[./data/design.xlsx?mode=card&caption=別紙1　設計データ&pageBreak=before&orientation=portrait]]

別紙1の設計データは、このPDFとは別のファイルとして納品物に同梱します。

以上
