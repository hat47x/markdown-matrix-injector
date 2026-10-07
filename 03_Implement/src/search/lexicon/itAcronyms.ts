/**
 * Built-in lexicon of abbreviations used in Japanese IT / SI design documents
 * (ADR-0023). A request that says "NFR" or "N/W" must be able to reach a table
 * named 非機能要件 or ネットワーク設計書; the two share no characters, so no
 * amount of fuzzy matching finds the pair. The pairing is finite, public
 * vocabulary, not meaning inference: it is a lookup (method class M0).
 *
 * Rules for this file:
 * - Entries come from general IT / SI practice. They are not derived from any
 *   evaluation set, and no entry may be added or changed because a held-out
 *   query failed (the held-out sets are consumed once they are scored).
 * - An entry pairs short forms with the long forms a design document is likely
 *   to use. Each (short, long) pair becomes one two-member synonym group, so a
 *   short form never becomes a synonym of a *different* long form of the same entry.
 * - A hit only widens retrieval. The candidate stays `inferred`, is shown with
 *   the request it was matched through, and is never confirmed automatically.
 * - Forms that mean something else in common business use (ID, IT as in
 *   "IT部門", AP, PL) are left out on purpose. Prefer a miss to a wrong table.
 *
 * Users extend or override the lexicon with their own glossary (a table of
 * abbreviation / formal name pairs in a workbook, or settings); this list is
 * only the shared starting point.
 */

export const IT_ACRONYM_LEXICON_VERSION = '2026-10-07.1';

export interface AcronymEntry {
  /** Short forms: acronyms, symbols, clipped words. Matched case- and width-insensitively. */
  readonly short: readonly string[];
  /** Long forms a document may use for the same thing. */
  readonly long: readonly string[];
}

const e = (short: string, long: string): AcronymEntry => ({
  short: short.split('|'),
  long: long.split('|'),
});

export const IT_ACRONYM_LEXICON: readonly AcronymEntry[] = [
  // Infrastructure and network
  e('FW', 'ファイアウォール'),
  e('N/W|NW', 'ネットワーク'),
  e('LB', 'ロードバランサ|負荷分散'),
  e('DB', 'データベース'),
  e('DWH', 'データウェアハウス'),
  e('VM', '仮想マシン'),
  e('OS', 'オペレーティングシステム'),
  e('MW', 'ミドルウェア'),
  e('HW', 'ハードウェア'),
  e('GW', 'ゲートウェイ'),
  e('DC', 'データセンター'),
  e('AZ', 'アベイラビリティゾーン'),
  e('SG', 'セキュリティグループ'),
  e('ACL', 'アクセス制御リスト'),
  e('NAT', 'アドレス変換'),
  e('NTP', '時刻同期'),
  e('HA', '高可用性'),
  e('DR', 'ディザスタリカバリ|災害対策'),
  e('BCP', '事業継続計画'),
  e('BKUP|BK', 'バックアップ'),
  e('RTO', '目標復旧時間'),
  e('RPO', '目標復旧時点'),
  e('SLA', 'サービスレベル'),
  // Requirements, planning, tests
  e('NFR', '非機能要件'),
  e('FR', '機能要件'),
  e('REQ', '要件'),
  e('SPEC', '仕様'),
  e('CR', '変更要求'),
  e('RFP', '提案依頼書'),
  e('RFI', '情報提供依頼書'),
  e('SOW', '作業範囲'),
  e('WBS', '作業分解構造'),
  e('KPI', '重要業績評価指標'),
  e('KGI', '重要目標達成指標'),
  e('RACI', '役割分担'),
  e('PMO', 'プロジェクト管理'),
  e('PoC', '概念実証'),
  e('MTG', '打合せ|ミーティング'),
  e('Q&A', '質疑応答'),
  e('TBD', '未定'),
  e('UAT', '受入テスト|ユーザー受入テスト'),
  e('UT', '単体テスト'),
  e('ST', '総合テスト|システムテスト'),
  e('TC', 'テストケース'),
  e('QA', '品質保証'),
  e('QC', '品質管理'),
  e('要定', '要件定義'),
  e('基設', '基本設計'),
  e('詳設', '詳細設計'),
  // Security and identity
  e('RBAC', 'ロールベースアクセス制御'),
  e('IAM', 'アクセス管理'),
  e('SSO', 'シングルサインオン'),
  e('MFA', '多要素認証'),
  e('2FA', '二要素認証'),
  e('PW|PWD', 'パスワード'),
  e('WAF', 'Webアプリケーションファイアウォール'),
  e('IDS', '侵入検知'),
  e('IPS', '侵入防止'),
  e('SIEM', 'ログ監視'),
  e('DLP', '情報漏えい対策'),
  e('PII', '個人情報'),
  e('ISMS', '情報セキュリティ'),
  // Operations and environments
  e('INC', 'インシデント'),
  e('PRB', '問題管理'),
  e('CMDB', '構成管理'),
  e('SOP', '標準作業手順'),
  e('MON', '監視'),
  e('OPS', '運用'),
  e('DEV', '開発環境'),
  e('STG', 'ステージング'),
  e('PRD|PROD', '本番'),
  e('CONF|CFG', '設定'),
  e('PARAM', 'パラメータ'),
  // Data and interfaces
  e('MST', 'マスタ'),
  e('TRN', 'トランザクション'),
  e('TBL', 'テーブル'),
  e('IDX', 'インデックス'),
  e('PK', '主キー'),
  e('FK', '外部キー'),
  e('ER', 'エンティティ関連'),
  e('DFD', 'データフロー図'),
  e('DDL', 'テーブル定義'),
  e('I/F', 'インターフェース'),
  e('MQ', 'メッセージキュー'),
  e('FTP|SFTP', 'ファイル転送'),
  e('MSG', 'メッセージ'),
  e('ERR', 'エラー'),
  e('BAT', 'バッチ'),
  e('RPT', '帳票|レポート'),
  e('SCR', '画面'),
  e('UI', 'ユーザーインターフェース'),
  // Business systems
  e('ERP', '基幹システム'),
  e('SCM', 'サプライチェーン'),
  e('CRM', '顧客管理'),
  e('MES', '製造実行'),
  e('POS', '販売時点情報'),
  e('PO', '発注'),
  e('SO', '受注'),
  e('INV', '請求'),
  e('AR', '売掛'),
  e('GL', '総勘定元帳'),
  e('P/L', '損益計算書'),
  e('B/S', '貸借対照表'),
  e('CF', 'キャッシュフロー'),
  e('NDA', '秘密保持契約'),
  e('MSA', '基本契約'),
  e('ROI', '投資対効果'),
  e('HR', '人事'),
];

/** The lexicon as two-member synonym groups, in the shape `compileQuery` takes. */
export const IT_ACRONYM_GROUPS: readonly (readonly string[])[] = IT_ACRONYM_LEXICON.flatMap(
  (entry) => entry.short.flatMap((short) => entry.long.map((long) => [short, long] as const)),
);
