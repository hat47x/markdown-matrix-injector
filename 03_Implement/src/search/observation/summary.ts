import type {
  SearchObservationClass,
  SearchObservationOutcome,
  SearchObservationRecord,
} from './types.js';

export interface SearchObservationSummary {
  records: number;
  from?: string;
  to?: string;
  classOutcome: Array<{
    class: SearchObservationClass;
    outcome: SearchObservationOutcome;
    count: number;
    share: number;
  }>;
  fitCalibration: Array<{
    bucket: '<0.5' | '0.5-0.7' | '0.7-0.9' | '>=0.9';
    picked: number;
    pickedRank1: number;
    rank1Rate: number | null;
  }>;
  alias: {
    offered: number;
    accepted: number;
    acceptanceRate: number | null;
  };
}

export function summarizeSearchObservations(
  records: readonly SearchObservationRecord[],
): SearchObservationSummary {
  const dates = records.map((record) => record.at).sort();
  const cross = new Map<string, {
    class: SearchObservationClass;
    outcome: SearchObservationOutcome;
    count: number;
  }>();
  for (const record of records) {
    const key = `${record.final.class}\u0000${record.outcome}`;
    const existing = cross.get(key) ?? {
      class: record.final.class,
      outcome: record.outcome,
      count: 0,
    };
    existing.count += 1;
    cross.set(key, existing);
  }

  const buckets = new Map<string, { picked: number; pickedRank1: number }>();
  for (const bucket of ['<0.5', '0.5-0.7', '0.7-0.9', '>=0.9']) {
    buckets.set(bucket, { picked: 0, pickedRank1: 0 });
  }
  for (const record of records) {
    if (record.picked?.fit === undefined) continue;
    const bucket = fitBucket(record.picked.fit);
    const stats = buckets.get(bucket)!;
    stats.picked += 1;
    if (record.picked.rank === 1) stats.pickedRank1 += 1;
  }

  const offered = records.filter((record) => record.alias !== 'none').length;
  const accepted = records.filter((record) => record.alias === 'offered-accepted').length;

  return {
    records: records.length,
    ...(dates.length > 0 ? { from: dates[0], to: dates.at(-1) } : {}),
    classOutcome: [...cross.values()]
      .sort((a, b) => a.class.localeCompare(b.class) || a.outcome.localeCompare(b.outcome))
      .map((item) => ({
        ...item,
        share: records.length === 0 ? 0 : item.count / records.length,
      })),
    fitCalibration: [...buckets.entries()].map(([bucket, stats]) => ({
      bucket: bucket as '<0.5' | '0.5-0.7' | '0.7-0.9' | '>=0.9',
      ...stats,
      rank1Rate: stats.picked === 0 ? null : stats.pickedRank1 / stats.picked,
    })),
    alias: {
      offered,
      accepted,
      acceptanceRate: offered === 0 ? null : accepted / offered,
    },
  };
}

export function renderSearchObservationSummaryMarkdown(
  summary: SearchObservationSummary,
): string {
  const percent = (value: number | null): string =>
    value === null ? '-' : `${(value * 100).toFixed(1)}%`;
  const lines = [
    '# MMI 検索観測の集計',
    '',
    `- 記録件数: ${summary.records}`,
    `- 期間: ${summary.from ?? '-'} 〜 ${summary.to ?? '-'}`,
    '',
    '## 分類 × 結末',
    '',
    '| 分類 | 結末 | 件数 | 割合 |',
    '| --- | --- | ---: | ---: |',
    ...summary.classOutcome.map((item) =>
      `| ${item.class} | ${item.outcome} | ${item.count} | ${percent(item.share)} |`),
    '',
    '## 適合度と先頭選択',
    '',
    '| 適合度 | 選択件数 | 先頭選択 | 先頭選択率 |',
    '| --- | ---: | ---: | ---: |',
    ...summary.fitCalibration.map((item) =>
      `| ${item.bucket} | ${item.picked} | ${item.pickedRank1} | ${percent(item.rank1Rate)} |`),
    '',
    '## 別名の提案',
    '',
    `- 提案件数: ${summary.alias.offered}`,
    `- 受入件数: ${summary.alias.accepted}`,
    `- 受入率: ${percent(summary.alias.acceptanceRate)}`,
    '',
    '> 集計は件数だけです。依頼文、表名、ファイル名、利用者名は含みません。',
    '',
  ];
  return lines.join('\n');
}

function fitBucket(value: number): '<0.5' | '0.5-0.7' | '0.7-0.9' | '>=0.9' {
  if (value >= 0.9) return '>=0.9';
  if (value >= 0.7) return '0.7-0.9';
  if (value >= 0.5) return '0.5-0.7';
  return '<0.5';
}
