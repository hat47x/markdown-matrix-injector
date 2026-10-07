/**
 * Corpus for evaluation set v7 (ADR-0023): a fictional logistics / retail company whose design
 * documents use abbreviations of their own. It exists to measure the layer that reads abbreviation
 * pairs from the user's workbooks (documentGlossary.ts), so each target table is named by ONE form
 * only and the pair is written down, if at all, somewhere else:
 *
 *   glossary     the pair is a row of a 略語一覧 table (略称 / 正式名称 columns);
 *   mentioned    the pair is written as 「正式名称（ABC）」 inside another table's cells;
 *   undocumented the pair is written nowhere; only general knowledge links the forms.
 *
 * Every book and value is invented. The group of a target is metadata of this corpus (GROUP_OF),
 * not something the query texts carry.
 */
import fs from 'node:fs';
import path from 'node:path';
import { writeCorpus, type BookSpec } from './corpus.js';

const T = (title: string | undefined, columns: [string, string][], rows: number, origin = 'A1') => ({
  origin,
  ...(title ? { title } : {}),
  columns,
  rows,
});
const one = (file: string, sheet: string, columns: [string, string][], rows = 4, title?: string): BookSpec => ({
  file,
  sheets: [{ name: sheet, tables: [T(title, columns, rows)] }],
});

const PEOPLE = '佐藤|鈴木|高橋|田中|伊藤|渡辺';

export const BOOKS_V7: BookSpec[] = [
  // --- the glossary the company keeps ---------------------------------------------------------
  one('用語集_物流.xlsx', '略語一覧', [
    ['略称', 'cycle:DSP|TPL|RTN|LTM|PKG|ASN|VMI|CBM|OTD|SQE'],
    ['正式名称', 'cycle:配車計画|外部委託倉庫|返品受付|リードタイム管理|出荷梱包|事前出荷通知|ベンダー管理在庫|容積重量|納期遵守率|仕入先評価'],
    ['備考', 'pick:社内用語|業界用語|-'],
  ], 10),
  // --- glossary group: named by the formal name only -----------------------------------------------
  one('配送計画書.xlsx', '配車計画', [['便ID', 'seq:T%03d'], ['行先', 'pick:東京|大阪|名古屋|福岡'], ['出発時刻', 'pick:06:00|08:30|13:00'], ['車両', 'pick:2tトラック|4tトラック|軽バン']], 5),
  one('委託倉庫管理.xlsx', '外部委託倉庫契約', [['委託先', 'pick:甲倉庫|乙ロジ|丙物流'], ['契約期間', 'pick:2026/04-2027/03|2026/10-2027/09'], ['単価', 'int:80-300'], ['拠点', 'pick:関東|関西|九州']], 4),
  one('返品対応.xlsx', '返品受付一覧', [['受付番号', 'seq:RT%04d'], ['受付日', 'date:2026-09'], ['理由', 'pick:破損|誤配送|仕様違い'], ['状態', 'pick:受付|検品中|完了']], 5),
  {
    file: '調達管理.xlsx',
    sheets: [
      { name: 'リードタイム管理', tables: [T(undefined, [['品目', 'pick:梱包材|ラベル|パレット|緩衝材'], ['標準日数', 'int:2-10'], ['実績日数', 'int:2-14']], 4)] },
      { name: '仕入先評価', tables: [T(undefined, [['仕入先', 'pick:A商事|B工業|C資材'], ['評価点', 'int:60-100'], ['評価月', 'date:2026-09']], 3)] },
    ],
  },
  {
    file: '出荷基準書.xlsx',
    sheets: [
      { name: '出荷梱包基準', tables: [T(undefined, [['商品区分', 'pick:精密機器|食品|衣類|雑貨'], ['梱包材', 'pick:緩衝材|断熱箱|ポリ袋|段ボール'], ['段積み上限', 'int:2-8']], 4)] },
      { name: '事前出荷通知項目', tables: [T(undefined, [['項目名', 'pick:出荷日|品目コード|数量|ロット'], ['必須', 'pick:○|○|-'], ['形式', 'pick:日付|文字|数値']], 4)] },
    ],
  },
  {
    file: '在庫方針.xlsx',
    sheets: [
      { name: 'ベンダー管理在庫対象', tables: [T(undefined, [['品目', 'pick:梱包材|ラベル|資材'], ['ベンダー', 'pick:A商事|B工業|C資材'], ['補充点', 'int:50-500']], 3)] },
      { name: '容積重量換算表', tables: [T(undefined, [['サイズ区分', 'pick:60|80|100|120|140'], ['係数', 'pick:5000|6000|8000']], 5)] },
    ],
  },
  one('物流実績.xlsx', '納期遵守率推移', [['月', 'seq:2026-%02d'], ['遵守率', 'pick:97.5%|98.2%|99.1%'], ['目標', 'pick:98%']], 6),
  // --- mentioned group: the pair is written in another table's cells -------------------------------
  one('システム概要.xlsx', 'システム構成', [
    ['コンポーネント', 'cycle:ネットワーク（N/W）機器|データウェアハウス（DWH）|勤怠管理（KMS）|キャパシティ計画（CAP）|学習管理（LMS）'],
    ['概要', 'pick:拠点間接続|分析基盤|勤務実績|年次見直し|研修配信'],
    ['担当', `pick:${PEOPLE}`],
  ], 5, 'システム構成一覧'),
  one('基盤設計.xlsx', 'ネットワーク構成', [['機器', 'pick:ルータ|スイッチ|アクセスポイント'], ['設置場所', 'pick:本社|東京倉庫|大阪倉庫'], ['台数', 'int:1-12']], 4),
  one('分析基盤.xlsx', 'データウェアハウス連携定義', [['テーブル', 'pick:出荷実績|在庫推移|受注履歴'], ['連携頻度', 'pick:日次|週次'], ['方式', 'pick:バッチ|差分']], 3),
  one('人事システム.xlsx', '勤怠管理マスタ', [['社員区分', 'pick:正社員|契約社員|パート'], ['勤務区分', 'pick:日勤|夜勤|シフト'], ['所定時間', 'pick:7.5|8|6']], 4),
  one('計画書.xlsx', 'キャパシティ計画表', [['年度', 'seq:%d'], ['想定量', 'int:100-900'], ['備考', 'pick:-|繁忙期増']], 4),
  one('教育.xlsx', '学習管理利用状況', [['講座', 'pick:安全衛生|フォークリフト|接客'], ['受講者数', 'int:5-80'], ['修了率', 'pick:80%|92%|100%']], 4),
  // --- undocumented group: general knowledge only ----------------------------------------------------
  one('要件定義.xlsx', '非機能要件', [['分類', 'pick:性能|可用性|セキュリティ'], ['項目', 'pick:応答時間|稼働率|パスワード方針'], ['目標値', 'pick:3秒以内|99.9%|12文字以上']], 4),
  one('変更管理.xlsx', '変更要求', [['件名', 'pick:画面項目追加|帳票変更|連携追加'], ['起票者', `pick:${PEOPLE}`], ['影響度', 'pick:大|中|小']], 4),
  one('運用設計.xlsx', 'バックアップ設計', [['対象', 'pick:業務DB|設定ファイル|ログ'], ['世代数', 'int:3-14'], ['保管場所', 'pick:別拠点|クラウド']], 3),
  one('権限設計.xlsx', 'ロール定義', [['ロール', 'pick:管理者|倉庫担当|配送担当|閲覧者'], ['説明', 'pick:全操作|入出荷操作|配車操作|参照のみ']], 4),
  one('テスト計画.xlsx', '受入テスト項目', [['項目', 'pick:入荷登録|出荷指示|返品処理'], ['期待結果', 'pick:登録される|指示が出る|在庫が戻る'], ['結果', 'pick:OK|NG|未']], 4),
  // --- distractors -----------------------------------------------------------------------------
  one('会議体一覧.xlsx', 'Sheet1', [['会議名', 'pick:定例会|運用会議|月次報告'], ['頻度', 'pick:毎週|月次'], ['主催', `pick:${PEOPLE}`]], 3),
  one('経費精算.xlsx', '精算一覧', [['申請番号', 'seq:EX%04d'], ['金額', 'int:500-50000'], ['状態', 'pick:申請|承認|差戻し']], 5),
  one('契約台帳.xlsx', '契約', [['契約先', 'pick:甲社|乙社|丙社'], ['開始日', 'date:2026-04'], ['更新', 'pick:自動|手動']], 4),
  one('社内連絡先.xlsx', '連絡先', [['部署', 'pick:総務|物流|情報システム'], ['内線', 'int:1000-1999'], ['担当', `pick:${PEOPLE}`]], 4),
  one('備品管理.xlsx', '備品', [['備品名', 'pick:ハンディ端末|ラベルプリンタ|台車'], ['数量', 'int:1-30'], ['保管場所', 'pick:本社|東京倉庫']], 4),
  one('勤務シフト.xlsx', 'シフト', [['日付', 'date:2026-10'], ['早番', `pick:${PEOPLE}`], ['遅番', `pick:${PEOPLE}`]], 5),
];

/** Which kind of evidence ties each target's sheet to its abbreviation (corpus metadata, not in the queries). */
export const GROUP_OF: Readonly<Record<string, 'glossary' | 'mentioned' | 'undocumented'>> = {
  配車計画: 'glossary',
  外部委託倉庫契約: 'glossary',
  返品受付一覧: 'glossary',
  リードタイム管理: 'glossary',
  仕入先評価: 'glossary',
  出荷梱包基準: 'glossary',
  事前出荷通知項目: 'glossary',
  ベンダー管理在庫対象: 'glossary',
  容積重量換算表: 'glossary',
  納期遵守率推移: 'glossary',
  ネットワーク構成: 'mentioned',
  データウェアハウス連携定義: 'mentioned',
  勤怠管理マスタ: 'mentioned',
  キャパシティ計画表: 'mentioned',
  学習管理利用状況: 'mentioned',
  非機能要件: 'undocumented',
  変更要求: 'undocumented',
  バックアップ設計: 'undocumented',
  ロール定義: 'undocumented',
  受入テスト項目: 'undocumented',
};

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const outDir = process.argv[2];
  if (!outDir) throw new Error('usage: corpus-v7.ts <outDir>');
  const manifest = writeCorpus(outDir, 20261007, BOOKS_V7);
  fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${BOOKS_V7.length} books, ${manifest.length} regions -> ${outDir}`);
}
