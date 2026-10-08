/**
 * Counts-only summary of observation records (design §6). The output is safe to share: it holds no
 * request text, table name or file name. It also states how far to trust the numbers, using the
 * thresholds the design fixed before any data existed (§7).
 */
import { OUTCOMES, REQUEST_CLASSES, type ObservationRecord, type Outcome, type RequestClass } from './types.js';

/** Fewer unresolved sessions than this do not support a conclusion (design §7). */
export const MIN_UNRESOLVED_FOR_CONCLUSION = 100;

export const FIT_BINS = [
  { label: '0.90以上', min: 0.9, max: Infinity },
  { label: '0.70〜0.90', min: 0.7, max: 0.9 },
  { label: '0.50〜0.70', min: 0.5, max: 0.7 },
  { label: '0.50未満', min: -Infinity, max: 0.5 },
] as const;

export interface ObservationSummary {
  total: number;
  from?: string;
  to?: string;
  /**
   * Sessions whose last search did not find a table and whose cause was determined (design §7:
   * the threshold counts determined classes only). `other` is counted separately as `undetermined`.
   */
  unresolved: number;
  undetermined: number;
  byClass: Record<RequestClass, number>;
  /** class -> outcome -> sessions. */
  matrix: Record<RequestClass, Record<Outcome, number>>;
  /**
   * Calibration of the fit guide: sessions that picked a candidate from the main list (not a near
   * miss, which has its own capped fit and its own ranking), by fit, and how often rank 1 was picked.
   */
  fitBins: { label: string; picked: number; first: number }[];
  alias: { offered: number; accepted: number };
}

const zeroRow = (): Record<Outcome, number> => ({ 'picked-candidate': 0, 'picked-near-miss': 0, 'picked-after-edit': 0, cancelled: 0 });

export function summarize(records: readonly ObservationRecord[]): ObservationSummary {
  const byClass = Object.fromEntries(REQUEST_CLASSES.map((name) => [name, 0])) as Record<RequestClass, number>;
  const matrix = Object.fromEntries(REQUEST_CLASSES.map((name) => [name, zeroRow()])) as Record<RequestClass, Record<Outcome, number>>;
  const fitBins = FIT_BINS.map((bin) => ({ label: bin.label, picked: 0, first: 0 }));
  const alias = { offered: 0, accepted: 0 };
  const days = records.map((record) => record.at).sort();

  for (const record of records) {
    const name = REQUEST_CLASSES.includes(record.final.class) ? record.final.class : 'other';
    byClass[name] += 1;
    if (OUTCOMES.includes(record.outcome)) matrix[name][record.outcome] += 1;
    if (record.picked?.fit !== undefined && record.outcome !== 'picked-near-miss') {
      const fit = record.picked.fit;
      const index = FIT_BINS.findIndex((bin) => fit >= bin.min && fit < bin.max);
      if (index >= 0) {
        fitBins[index].picked += 1;
        if (record.picked.rank === 1) fitBins[index].first += 1;
      }
    }
    if (record.alias !== 'none') alias.offered += 1;
    if (record.alias === 'offered-accepted') alias.accepted += 1;
  }

  return {
    total: records.length,
    ...(days.length > 0 ? { from: days[0], to: days[days.length - 1] } : {}),
    unresolved: byClass['unsupported-op'] + byClass.notation + byClass.abbreviation + byClass.description + byClass['no-such-table'],
    undetermined: byClass.other,
    byClass,
    matrix,
    fitBins,
    alias,
  };
}

const CLASS_LABEL: Record<RequestClass, string> = {
  found: '名前または別名で見つかった',
  'unsupported-op': '未対応の操作の依頼',
  notation: '表記ゆれ・誤字',
  abbreviation: '略語らしい語',
  description: '説明・言い換え',
  'no-such-table': '該当する表なし',
  other: '判定できない',
};
const OUTCOME_LABEL: Record<Outcome, string> = {
  'picked-candidate': '候補を選んだ',
  'picked-near-miss': '近い表を選んだ',
  'picked-after-edit': '入力を直して選んだ',
  cancelled: '選ばず閉じた',
};

const percent = (part: number, whole: number): string => (whole === 0 ? '-' : `${Math.round((part / whole) * 100)}%`);

/** The summary as Markdown. Counts only. */
export function renderSummary(summary: ObservationSummary): string {
  const lines: string[] = ['# 表の検索の観測（集計）', ''];
  lines.push(`- 記録件数: ${summary.total}${summary.from ? `（${summary.from} 〜 ${summary.to}）` : ''}`);
  lines.push(`- 名前で見つからなかったセッション（原因が判定できたもの）: ${summary.unresolved}`);
  lines.push(`- 名前で見つからず、原因を判定できなかったセッション: ${summary.undetermined}`);
  lines.push('- この集計に依頼文・表名・ファイル名・利用者名は含まれません。');
  lines.push(
    summary.unresolved < MIN_UNRESOLVED_FOR_CONCLUSION
      ? `- 見つからなかったセッションが${MIN_UNRESOLVED_FOR_CONCLUSION}件に満たないため、割合は傾向としても断定できません。`
      : `- 見つからなかったセッションが${MIN_UNRESOLVED_FOR_CONCLUSION}件以上あります。判断には、3人以上の集計を合算してください。`,
  );
  lines.push('- 分類は規則による推定で、利用者の意図そのものではありません。', '');

  lines.push('## 分類と結末', '');
  lines.push(`| 分類 | 件数 | 割合 | ${OUTCOMES.map((outcome) => OUTCOME_LABEL[outcome]).join(' | ')} |`);
  lines.push(`| --- | ---: | ---: | ${OUTCOMES.map(() => '---:').join(' | ')} |`);
  for (const name of REQUEST_CLASSES) {
    if (summary.byClass[name] === 0) continue;
    lines.push(`| ${CLASS_LABEL[name]}（${name}） | ${summary.byClass[name]} | ${percent(summary.byClass[name], summary.total)} | ${OUTCOMES.map((outcome) => summary.matrix[name][outcome]).join(' | ')} |`);
  }
  if (summary.total === 0) lines.push('| （記録なし） | 0 | - |' + OUTCOMES.map(() => ' 0 |').join(''));

  lines.push('', '## 適合度と先頭候補の選択', '');
  lines.push('| 適合度 | 選んだ件数 | 先頭を選んだ割合 |', '| --- | ---: | ---: |');
  for (const bin of summary.fitBins) lines.push(`| ${bin.label} | ${bin.picked} | ${percent(bin.first, bin.picked)} |`);

  lines.push('', '## 別名の登録の提案', '');
  lines.push(`- 提案した回数: ${summary.alias.offered}`);
  lines.push(`- 登録した回数: ${summary.alias.accepted}（${percent(summary.alias.accepted, summary.alias.offered)}）`, '');
  return lines.join('\n');
}
