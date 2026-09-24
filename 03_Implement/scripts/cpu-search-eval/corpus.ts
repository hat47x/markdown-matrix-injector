/**
 * Fictional business corpus for issue-0115 (input-assistance-cpu-search.md
 * §5.4). Every book, person and value is invented; this is "業務を模した架空
 * データ", reported separately from the synthetic scale corpus (scale.ts).
 *
 * Deliberate traps: same sheet/table names in different systems (画面一覧,
 * テーブル一覧), several tables per sheet, tables away from A1, merged and
 * detached titles, generic sheet names (Sheet1), duplicate headers, and
 * near-synonym titles (インターフェース一覧 vs 外部IF一覧).
 *
 * Deterministic: a fixed seed produces byte-identical cell content.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import XLSX from 'xlsx';

export const DEFAULT_CORPUS_DIR = path.join(os.tmpdir(), 'mmi-cpu-search-eval', 'corpus');

type Gen = string;

interface TableSpec {
  /** Top-left of the title if present, else of the header row. */
  origin: string;
  title?: string;
  /** Merge the title across the table width. */
  merged?: boolean;
  /** Blank rows between title and header (0 = glued). */
  gap?: number;
  columns: [header: string, gen: Gen][];
  rows: number;
}

interface BookSpec {
  file: string;
  sheets: { name: string; tables: TableSpec[] }[];
}

const PEOPLE = '佐藤|鈴木|高橋|田中|伊藤|渡辺|山本|中村|小林|加藤';
const STATE = '未着手|対応中|完了|保留';

export const BOOKS: BookSpec[] = [
  {
    file: '受注_基本設計書.xlsx',
    sheets: [
      { name: '画面一覧', tables: [{ origin: 'A1', title: '受注管理システム 画面一覧', merged: true, columns: [['画面ID', 'seq:ORD-S%02d'], ['画面名', 'pick:受注登録|受注照会|出荷指示|在庫引当|顧客検索|見積登録|返品受付'], ['分類', 'pick:登録|照会|帳票'], ['担当', `pick:${PEOPLE}`]], rows: 7 }] },
      { name: '帳票一覧', tables: [{ origin: 'B2', columns: [['帳票ID', 'seq:ORD-R%02d'], ['帳票名', 'pick:受注明細書|出荷案内書|納品書|請求予定表'], ['出力形式', 'pick:PDF|CSV|Excel'], ['頻度', 'pick:日次|月次|随時']], rows: 4 }] },
      {
        name: '状態遷移',
        tables: [
          { origin: 'B2', title: '受注状態遷移表', gap: 1, columns: [['ID', 'seq:%d'], ['現在状態', 'pick:受付|引当済|出荷済|取消'], ['イベント', 'pick:引当|出荷|取消|返品'], ['遷移先', 'pick:引当済|出荷済|取消|返品済'], ['備考', 'pick:-|在庫不足時は保留|顧客承認要']], rows: 6 },
          { origin: 'B12', title: '出荷状態遷移表', gap: 1, columns: [['ID', 'seq:%d'], ['現在状態', 'pick:出荷待ち|梱包中|出荷済'], ['イベント', 'pick:梱包|発送|配達完了'], ['遷移先', 'pick:梱包中|出荷済|配達済']], rows: 4 },
        ],
      },
    ],
  },
  {
    file: '会計_基本設計書.xlsx',
    sheets: [
      { name: '画面一覧', tables: [{ origin: 'A1', title: '会計連携システム 画面一覧', merged: true, columns: [['画面ID', 'seq:ACC-S%02d'], ['画面名', 'pick:仕訳入力|仕訳照会|残高照会|締め処理|科目マスタ'], ['分類', 'pick:登録|照会|バッチ'], ['担当', `pick:${PEOPLE}`]], rows: 5 }] },
      { name: 'バッチ一覧', tables: [{ origin: 'A1', columns: [['ジョブID', 'seq:JOB%03d'], ['ジョブ名', 'pick:日次仕訳連携|月次締め|残高集計|マスタ同期'], ['起動条件', 'pick:時刻起動|先行ジョブ完了|手動'], ['実行時刻', 'pick:01:00|02:30|05:00|-']], rows: 5 }] },
      { name: '仕訳パターン', tables: [{ origin: 'C3', title: '自動仕訳パターン定義', columns: [['パターンID', 'seq:P%02d'], ['借方科目', 'pick:売掛金|現金|仕入|買掛金'], ['貸方科目', 'pick:売上|売掛金|買掛金|現金'], ['摘要', 'pick:売上計上|入金消込|仕入計上|支払']], rows: 5 }] },
    ],
  },
  {
    file: '受注_API仕様書.xlsx',
    sheets: [
      { name: 'IF一覧', tables: [{ origin: 'C4', title: 'インターフェース一覧', merged: true, columns: [['IF-ID', 'seq:IF-%03d'], ['エンドポイント', 'pick:/orders|/orders/{id}|/shipments|/customers|/stocks'], ['メソッド', 'pick:GET|POST|PUT|DELETE'], ['概要', 'pick:受注登録|受注取得|出荷登録|顧客検索|在庫照会'], ['認証', 'pick:要|不要']], rows: 6 }] },
      { name: 'エラーコード', tables: [{ origin: 'A1', columns: [['コード', 'seq:E%04d'], ['メッセージ', 'pick:入力値不正|権限なし|対象なし|競合|内部エラー'], ['HTTPステータス', 'pick:400|403|404|409|500'], ['対処', 'pick:入力を確認|管理者へ連絡|再試行']], rows: 5 }] },
    ],
  },
  {
    file: '要件定義書.xlsx',
    sheets: [
      { name: '機能要件', tables: [{ origin: 'A1', columns: [['要件ID', 'seq:FR-%03d'], ['要件名', 'pick:受注を登録できる|在庫を引当できる|請求を締められる|帳票を出力できる|権限で画面を制御する'], ['優先度', 'pick:高|中|低'], ['出典', 'pick:ヒアリング|RFP|現行調査']], rows: 8 }] },
      { name: '非機能要件', tables: [{ origin: 'A1', columns: [['分類', 'pick:性能|可用性|セキュリティ|運用'], ['項目', 'pick:応答時間|稼働率|パスワード方針|バックアップ'], ['目標値', 'pick:3秒以内|99.9%|12文字以上|日次'], ['測定方法', 'pick:負荷試験|監視|設定確認|運用記録']], rows: 6 }] },
    ],
  },
  {
    file: '要件トレーサビリティマトリクス.xlsx',
    sheets: [{ name: 'Sheet1', tables: [{ origin: 'B3', title: '要件トレーサビリティ', gap: 1, columns: [['要件ID', 'seq:FR-%03d'], ['設計書', 'pick:受注_基本設計書|会計_基本設計書|受注_API仕様書'], ['試験ID', 'seq:IT-%03d'], ['状態', 'pick:未検証|検証済|要確認']], rows: 8 }] }],
  },
  {
    file: 'リリース判定チェックリスト.xlsx',
    sheets: [
      {
        name: '判定',
        tables: [
          { origin: 'A1', title: 'リリース判定', merged: true, columns: [['No', 'seq:%d'], ['確認項目', 'pick:性能試験|脆弱性診断|移行リハーサル|運用引継ぎ|利用者教育|障害対応体制'], ['判定', 'pick:OK|要確認|NG'], ['担当者', `pick:${PEOPLE}`], ['備考', 'pick:-|再試験予定|条件付き']], rows: 6 },
          { origin: 'A11', title: '承認者', gap: 0, columns: [['役割', 'pick:PM|品質責任者|顧客責任者'], ['氏名', `pick:${PEOPLE}`], ['承認日', 'date:2026-09']], rows: 3 },
        ],
      },
    ],
  },
  {
    file: '障害管理台帳.xlsx',
    sheets: [
      { name: '障害一覧', tables: [{ origin: 'A1', columns: [['障害ID', 'seq:BUG-%04d'], ['発生日', 'date:2026-08'], ['事象', 'pick:画面が固まる|帳票の文字化け|在庫数不一致|ログイン不可|バッチ遅延'], ['重要度', 'pick:高|中|低'], ['状態', `pick:${STATE}`], ['担当', `pick:${PEOPLE}`]], rows: 8 }] },
      { name: '切り分け手順', tables: [{ origin: 'B2', title: '障害切り分け手順', gap: 1, columns: [['手順No', 'seq:%d'], ['確認内容', 'pick:ログ確認|DB接続確認|ネットワーク疎通|ジョブ状態確認'], ['判断基準', 'pick:エラー出力あり|接続不可|応答なし|異常終了'], ['次の手順', 'pick:2|3|4|エスカレーション']], rows: 5 }] },
    ],
  },
  {
    file: '権限設計書.xlsx',
    sheets: [
      { name: '権限', tables: [{ origin: 'A1', title: '権限マトリクス', columns: [['機能', 'pick:受注登録|受注照会|出荷指示|仕訳入力|マスタ保守'], ['一般', 'pick:○|×'], ['管理者', 'pick:○'], ['監査', 'pick:○|×']], rows: 5 }] },
      { name: 'ロール', tables: [{ origin: 'A1', columns: [['ロール', 'pick:一般利用者|業務管理者|システム管理者|監査担当'], ['説明', 'pick:日常業務|承認業務|設定変更|閲覧のみ'], ['付与条件', 'pick:部門長申請|情報システム部承認|監査部指名']], rows: 4 }] },
    ],
  },
  {
    file: 'テスト計画書.xlsx',
    sheets: [
      { name: 'スケジュール', tables: [{ origin: 'A1', title: '試験スケジュール', merged: true, columns: [['工程', 'pick:単体試験|結合試験|総合試験|受入試験'], ['開始日', 'date:2026-10'], ['終了日', 'date:2026-11'], ['責任者', `pick:${PEOPLE}`]], rows: 4 }] },
      { name: '観点', tables: [{ origin: 'A1', columns: [['観点ID', 'seq:V%02d'], ['観点', 'pick:境界値|異常系|権限|同時実行|データ移行'], ['対象機能', 'pick:受注登録|出荷指示|仕訳入力|締め処理']], rows: 5 }] },
    ],
  },
  {
    file: '結合テスト仕様書_受注.xlsx',
    sheets: [{ name: 'テストケース', tables: [{ origin: 'A3', title: '結合テストケース（受注）', gap: 1, columns: [['試験ID', 'seq:IT-%03d'], ['試験項目', 'pick:受注登録から出荷まで|在庫不足時の保留|取消後の在庫戻し|返品処理'], ['手順', 'pick:画面から登録|APIから登録|バッチ実行'], ['期待結果', 'pick:出荷済になる|保留になる|在庫が戻る|返品済になる'], ['結果', 'pick:OK|NG|未実施']], rows: 8 }] }],
  },
  {
    file: '移行計画書.xlsx',
    sheets: [
      { name: '移行対象', tables: [{ origin: 'A1', columns: [['データ名', 'pick:顧客マスタ|商品マスタ|受注履歴|仕訳履歴'], ['件数', 'int:1000-500000'], ['移行方式', 'pick:ツール一括|手作業|差分移行'], ['担当', `pick:${PEOPLE}`]], rows: 4 }] },
      { name: 'リハーサル', tables: [{ origin: 'A1', title: '移行リハーサル実績', gap: 0, columns: [['回', 'seq:第%d回'], ['実施日', 'date:2026-09'], ['結果', 'pick:成功|一部失敗|中止'], ['課題', 'pick:-|件数差異|時間超過|権限不足']], rows: 3 }] },
    ],
  },
  { file: '課題管理表.xlsx', sheets: [{ name: '課題一覧', tables: [{ origin: 'A1', columns: [['課題No', 'seq:%d'], ['件名', 'pick:仕様未確定|環境遅延|要員不足|性能懸念|外部IF調整'], ['起票日', 'date:2026-07'], ['期限', 'date:2026-10'], ['状態', `pick:${STATE}`], ['担当者', `pick:${PEOPLE}`]], rows: 7 }] }] },
  { file: 'WBS.xlsx', sheets: [{ name: 'WBS', tables: [{ origin: 'A2', columns: [['WBS番号', 'seq:1.%d'], ['タスク', 'pick:要件定義|基本設計|詳細設計|製造|結合試験|移行'], ['担当', `pick:${PEOPLE}`], ['開始', 'date:2026-04'], ['終了', 'date:2026-06'], ['進捗率', 'int:0-100']], rows: 6 }] }] },
  { file: '会議体一覧.xlsx', sheets: [{ name: 'Sheet1', tables: [{ origin: 'A1', columns: [['会議名', 'pick:定例会|ステアリングコミッティ|設計レビュー|品質会議'], ['頻度', 'pick:週次|月次|随時'], ['参加者', 'pick:PM・リーダー|役員|設計者|品質担当'], ['目的', 'pick:進捗確認|意思決定|設計承認|品質評価']], rows: 4 }] }] },
  {
    file: 'コード定義書.xlsx',
    sheets: [
      { name: '区分コード', tables: [{ origin: 'A1', columns: [['区分', 'pick:受注区分|出荷区分|支払区分'], ['コード', 'seq:%02d'], ['名称', 'pick:通常|至急|分納|前払|後払']], rows: 6 }] },
      { name: '都道府県', tables: [{ origin: 'A1', columns: [['コード', 'seq:%02d'], ['都道府県', 'pick:北海道|青森県|岩手県|宮城県|秋田県']], rows: 5 }] },
    ],
  },
  {
    file: 'DB設計書_受注.xlsx',
    sheets: [
      { name: 'テーブル一覧', tables: [{ origin: 'A1', title: '受注DB テーブル一覧', columns: [['テーブル名', 'pick:T_ORDER|T_ORDER_DETAIL|T_SHIPMENT|M_CUSTOMER'], ['論理名', 'pick:受注|受注明細|出荷|顧客マスタ'], ['概要', 'pick:受注ヘッダ|受注の明細行|出荷実績|顧客情報']], rows: 4 }] },
      { name: 'T_ORDER', tables: [{ origin: 'A1', title: '受注テーブル定義', columns: [['カラム名', 'pick:ORDER_ID|CUSTOMER_ID|ORDER_DATE|STATUS|AMOUNT'], ['論理名', 'pick:受注ID|顧客ID|受注日|状態|金額'], ['型', 'pick:VARCHAR|DATE|NUMBER'], ['桁', 'int:1-20'], ['NULL許可', 'pick:可|不可']], rows: 5 }] },
    ],
  },
  {
    file: 'DB設計書_会計.xlsx',
    sheets: [
      { name: 'テーブル一覧', tables: [{ origin: 'A1', title: '会計DB テーブル一覧', columns: [['テーブル名', 'pick:T_JOURNAL|T_BALANCE|M_ACCOUNT'], ['論理名', 'pick:仕訳|残高|勘定科目マスタ'], ['概要', 'pick:仕訳明細|月次残高|科目定義']], rows: 3 }] },
      { name: 'T_JOURNAL', tables: [{ origin: 'A1', title: '仕訳テーブル定義', columns: [['カラム名', 'pick:JOURNAL_ID|ACCOUNT_CD|DEBIT|CREDIT|POSTED_AT'], ['論理名', 'pick:仕訳ID|科目コード|借方金額|貸方金額|計上日'], ['型', 'pick:VARCHAR|NUMBER|DATE'], ['桁', 'int:1-20'], ['NULL許可', 'pick:可|不可']], rows: 5 }] },
    ],
  },
  {
    file: '運用設計書.xlsx',
    sheets: [
      {
        name: '運用',
        tables: [
          { origin: 'B2', title: '監視項目', gap: 1, columns: [['監視ID', 'seq:MON-%02d'], ['監視対象', 'pick:CPU使用率|ディスク使用率|ジョブ異常終了|死活'], ['閾値', 'pick:80%|90%|1件|応答なし'], ['通知先', 'pick:運用チーム|当番携帯|メール']], rows: 4 },
          { origin: 'H2', title: 'バックアップ方針', gap: 1, columns: [['対象', 'pick:DB|ファイルサーバ|設定ファイル'], ['方式', 'pick:フル|差分|スナップショット'], ['世代', 'int:3-14'], ['保管場所', 'pick:遠隔地|テープ|クラウドストレージ']], rows: 3 },
        ],
      },
    ],
  },
  { file: '性能試験結果.xlsx', sheets: [{ name: '結果', tables: [{ origin: 'A1', title: '性能測定結果', merged: true, columns: [['シナリオ', 'pick:受注登録|受注照会|出荷指示|締め処理'], ['同時接続数', 'int:10-500'], ['平均応答時間', 'pick:0.8秒|1.2秒|2.5秒|4.1秒'], ['95パーセンタイル', 'pick:1.5秒|2.0秒|3.8秒|6.0秒'], ['判定', 'pick:OK|要確認|NG']], rows: 6 }] }] },
  { file: '脆弱性診断結果.xlsx', sheets: [{ name: '指摘事項', tables: [{ origin: 'A1', columns: [['指摘ID', 'seq:VUL-%03d'], ['画面', 'pick:ログイン|受注登録|顧客検索|マスタ保守'], ['脆弱性種別', 'pick:XSS|SQLインジェクション|CSRF|セッション固定'], ['危険度', 'pick:高|中|低'], ['対応状況', `pick:${STATE}`]], rows: 6 }] }] },
  { file: 'プロジェクト体制.xlsx', sheets: [{ name: '体制', tables: [{ origin: 'A1', title: 'プロジェクト体制表', columns: [['チーム', 'pick:PMO|業務チーム|基盤チーム|試験チーム'], ['リーダー', `pick:${PEOPLE}`], ['メンバー数', 'int:2-12'], ['役割', 'pick:全体管理|業務設計|環境構築|品質保証']], rows: 4 }] }] },
  { file: '用語集.xlsx', sheets: [{ name: '用語', tables: [{ origin: 'A1', columns: [['用語', 'pick:引当|締め|仕訳|分納|検収'], ['読み', 'pick:ひきあて|しめ|しわけ|ぶんのう|けんしゅう'], ['説明', 'pick:在庫を確保すること|期間を確定すること|取引を記録すること|分割して納品すること|納品物を確認すること']], rows: 5 }] }] },
  { file: '変更管理台帳.xlsx', sheets: [{ name: '変更要求', tables: [{ origin: 'A1', columns: [['CR番号', 'seq:CR-%03d'], ['件名', 'pick:帳票項目追加|画面項目変更|API追加|権限追加'], ['要求元', 'pick:営業部|経理部|情報システム部'], ['影響度', 'pick:大|中|小'], ['承認状態', 'pick:申請中|承認|却下']], rows: 5 }] }] },
  { file: '見積書.xlsx', sheets: [{ name: '見積', tables: [{ origin: 'B3', title: '工数見積', gap: 0, columns: [['工程', 'pick:要件定義|設計|製造|試験|移行'], ['人月', 'int:1-30'], ['単価', 'int:80-150'], ['金額', 'int:100-4500']], rows: 5 }] }] },
  { file: '外部IF一覧.xlsx', sheets: [{ name: 'Sheet1', tables: [{ origin: 'A1', title: '外部インターフェース一覧', columns: [['IF名', 'pick:受注連携|会計連携|在庫連携|顧客連携'], ['相手システム', 'pick:基幹システム|会計パッケージ|倉庫管理システム|CRM'], ['方向', 'pick:送信|受信|双方向'], ['方式', 'pick:ファイル|API|DB連携'], ['頻度', 'pick:日次|随時|月次']], rows: 4 }] }] },
  { file: 'メッセージ一覧.xlsx', sheets: [{ name: 'メッセージ', tables: [{ origin: 'A1', columns: [['メッセージID', 'seq:MSG%04d'], ['区分', 'pick:エラー|警告|情報'], ['本文', 'pick:必須項目が未入力です|在庫が不足しています|登録しました|権限がありません']], rows: 6 }] }] },
  { file: '帳票レイアウト_請求書.xlsx', sheets: [{ name: 'レイアウト', tables: [{ origin: 'A1', title: '請求書 項目定義', columns: [['項目名', 'pick:請求番号|請求日|顧客名|合計金額|振込先'], ['位置', 'pick:ヘッダ|明細|フッタ'], ['桁数', 'int:4-40'], ['編集', 'pick:ゼロ埋め|カンマ区切り|和暦|なし']], rows: 5 }] }] },
  { file: '教育計画.xlsx', sheets: [{ name: '研修', tables: [{ origin: 'A1', columns: [['研修名', 'pick:受注業務研修|会計操作研修|管理者研修'], ['対象者', 'pick:営業担当|経理担当|システム管理者'], ['日程', 'date:2026-12'], ['講師', `pick:${PEOPLE}`]], rows: 3 }] }] },
  { file: '問い合わせ管理.xlsx', sheets: [{ name: '問い合わせ', tables: [{ origin: 'A1', columns: [['受付番号', 'seq:Q%05d'], ['受付日', 'date:2026-09'], ['問い合わせ内容', 'pick:パスワード再発行|帳票が出ない|操作方法|データ修正依頼'], ['回答状況', 'pick:回答済|調査中|未回答']], rows: 6 }] }] },
  { file: 'サーバ構成.xlsx', sheets: [{ name: 'サーバ', tables: [{ origin: 'A1', title: 'サーバ一覧', columns: [['ホスト名', 'seq:srv-app%02d'], ['役割', 'pick:APサーバ|DBサーバ|バッチサーバ|Webサーバ'], ['OS', 'pick:RHEL 9|Windows Server 2022'], ['CPU', 'pick:4コア|8コア|16コア'], ['メモリ', 'pick:16GB|32GB|64GB']], rows: 5 }] }] },
  {
    file: 'ネットワーク設計書.xlsx',
    sheets: [
      { name: 'IP', tables: [{ origin: 'A1', title: 'IPアドレス割当表', columns: [['セグメント', 'pick:業務LAN|DMZ|管理LAN'], ['IPアドレス', 'seq:10.0.0.%d'], ['用途', 'pick:APサーバ|DBサーバ|踏み台|ロードバランサ']], rows: 5 }] },
      { name: 'FW', tables: [{ origin: 'A1', title: 'ファイアウォールルール', columns: [['ルールNo', 'seq:%d'], ['送信元', 'pick:業務LAN|DMZ|インターネット'], ['宛先', 'pick:APサーバ|DBサーバ|Webサーバ'], ['ポート', 'pick:443|1521|22|80'], ['許可', 'pick:許可|拒否']], rows: 5 }] },
    ],
  },
  { file: '売上集計.xlsx', sheets: [{ name: '月次', tables: [{ origin: 'A1', columns: [['月', 'seq:2026-%02d'], ['売上', 'int:1000-9000'], ['売上', 'int:1000-9000'], ['粗利', 'int:100-900']], rows: 6 }] }] },
];

export interface ManifestRegion {
  /** `${file}#${sheet}!${a1}` -- the ground-truth key the evaluation uses. */
  id: string;
  file: string;
  sheet: string;
  a1: string;
  title?: string;
  headers: string[];
  sampleRows: string[][];
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cellValue(gen: Gen, index: number, random: () => number): string | number {
  const [kind, arg = ''] = gen.split(/:(.*)/su);
  switch (kind) {
    case 'seq':
      return arg.replace(/%0?(\d*)d/u, (_m, width: string) => String(index + 1).padStart(Number(width || 0), '0'));
    case 'pick': {
      const options = arg.split('|');
      return options[Math.floor(random() * options.length)];
    }
    case 'int': {
      const [lo, hi] = arg.split('-').map(Number);
      return lo + Math.floor(random() * (hi - lo + 1));
    }
    case 'date': {
      const [year, month] = arg.split('-');
      return `${year}/${month}/${String(1 + Math.floor(random() * 28)).padStart(2, '0')}`;
    }
    default:
      throw new Error(`Unknown generator: ${gen}`);
  }
}

/** Writes every book into `outDir` and returns the ground-truth manifest. */
export function writeCorpus(outDir: string, seed = 20260924): ManifestRegion[] {
  fs.mkdirSync(outDir, { recursive: true });
  const random = mulberry32(seed);
  const manifest: ManifestRegion[] = [];
  for (const book of BOOKS) {
    const workbook = XLSX.utils.book_new();
    for (const sheetSpec of book.sheets) {
      const ws: XLSX.WorkSheet = {};
      const merges: XLSX.Range[] = [];
      let maxRow = 0;
      let maxCol = 0;
      const put = (r: number, c: number, value: string | number): void => {
        ws[XLSX.utils.encode_cell({ r, c })] = typeof value === 'number' ? { t: 'n', v: value } : { t: 's', v: value };
        maxRow = Math.max(maxRow, r);
        maxCol = Math.max(maxCol, c);
      };
      for (const table of sheetSpec.tables) {
        const origin = XLSX.utils.decode_cell(table.origin);
        const width = table.columns.length;
        let headerRow = origin.r;
        if (table.title) {
          put(origin.r, origin.c, table.title);
          if (table.merged) merges.push({ s: origin, e: { r: origin.r, c: origin.c + width - 1 } });
          headerRow = origin.r + 1 + (table.gap ?? 0);
        }
        table.columns.forEach(([header], c) => put(headerRow, origin.c + c, header));
        const sampleRows: string[][] = [];
        for (let r = 0; r < table.rows; r += 1) {
          const row = table.columns.map(([, gen], c) => {
            const value = cellValue(gen, r, random);
            put(headerRow + 1 + r, origin.c + c, value);
            return String(value);
          });
          if (r < 2) sampleRows.push(row);
        }
        const a1 = XLSX.utils.encode_range({ s: { r: headerRow, c: origin.c }, e: { r: headerRow + table.rows, c: origin.c + width - 1 } });
        manifest.push({
          id: `${book.file}#${sheetSpec.name}!${a1}`,
          file: book.file,
          sheet: sheetSpec.name,
          a1,
          title: table.title,
          headers: table.columns.map(([header]) => header),
          sampleRows,
        });
      }
      ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } });
      if (merges.length > 0) ws['!merges'] = merges;
      XLSX.utils.book_append_sheet(workbook, ws, sheetSpec.name);
    }
    fs.writeFileSync(path.join(outDir, book.file), XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
  }
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const outDir = process.argv[2] ?? DEFAULT_CORPUS_DIR;
  const manifest = writeCorpus(outDir);
  fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${BOOKS.length} books, ${manifest.length} regions -> ${outDir}`);
}
