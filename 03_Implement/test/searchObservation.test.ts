import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { Candidate, CompileResult } from '../src/search/nlQuery/compiler.js';
import { classifySearchObservation } from '../src/search/observation/classify.js';
import { buildSearchObservation } from '../src/search/observation/record.js';
import {
  appendSearchObservation,
  clearSearchObservations,
  readSearchObservationStore,
} from '../src/search/observation/store.js';
import {
  renderSearchObservationSummaryMarkdown,
  summarizeSearchObservations,
} from '../src/search/observation/summary.js';
import type { SearchObservationRecord } from '../src/search/observation/types.js';

function candidate(
  title: string,
  options: { fit?: number; basis?: Candidate['basis']; columns?: number } = {},
): Candidate {
  return {
    region: {
      id: `/ws/design.xlsx#Sheet1!A1:B2`,
      bookPath: '/ws/design.xlsx',
      bookStem: 'design',
      sheet: 'Sheet1',
      a1: 'A1:B2',
      title,
      range: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
      headerConfidence: 'likely',
      columns: [],
      valueSample: [],
      nonEmptyCells: 4,
      reasons: [],
      headers: ['ID', 'State'],
    },
    markdown: '![[./design.xlsx#Sheet1|A1:B2]]',
    explanation: 'fixture',
    retrievalScore: 1,
    coverage: 0.4,
    columns: Array.from({ length: options.columns ?? 0 }, (_, index) => ({
      requested: `c${index}`,
      header: `c${index}`,
      letter: String.fromCharCode(65 + index),
      index,
      match: 'exact' as const,
    })),
    partial: false,
    notes: [],
    ...(options.fit !== undefined ? { fit: options.fit } : {}),
    ...(options.basis ? { basis: options.basis } : {}),
  };
}

function result(
  status: CompileResult['status'],
  nearMisses?: Candidate[],
): CompileResult {
  return {
    status,
    ir: { input: 'fixture' } as CompileResult['ir'],
    candidates: status === 'candidates' ? [candidate('状態遷移表')] : [],
    reasons: [],
    requiresSelection: true,
    ...(nearMisses ? { nearMisses } : {}),
  };
}

test('classification follows frozen deterministic order', () => {
  assert.equal(
    classifySearchObservation('状態遷移表を見せて', result('candidates')).class,
    'found',
  );
  assert.equal(
    classifySearchObservation('担当者別に集計', result('unsupported')).class,
    'unsupported-op',
  );

  assert.equal(
    classifySearchObservation(
      '状態遷移票を見せて',
      result('no-match', [candidate('状態遷移表')]),
    ).class,
    'notation',
  );
  assert.equal(
    classifySearchObservation(
      'CBMの一覧',
      result('no-match', [candidate('容積重量一覧')]),
    ).class,
    'abbreviation',
  );
  assert.equal(
    classifySearchObservation(
      '誰が承認するか',
      result('no-match', [candidate('承認一覧', { columns: 2 })]),
    ).class,
    'description',
  );
  assert.equal(
    classifySearchObservation('給与の支給額', result('no-match')).class,
    'no-such-table',
  );
});

test('default record contains no query text, candidate name or file name', () => {
  const near = candidate('機密顧客一覧', { fit: 0.4 });
  const record = buildSearchObservation({
    finalQuery: 'ACME極秘顧客を探したい',
    result: result('no-match', [near]),
    queries: 2,
    outcome: 'picked-near-miss',
    picked: { candidate: near, rank: 1, nearMiss: true },
    alias: 'offered-declined',
    startedAtMs: 1000,
    endedAtMs: 4200,
    localDate: '2026-10-08',
  });

  const serialized = JSON.stringify(record);
  assert.equal(serialized.includes('ACME'), false);
  assert.equal(serialized.includes('機密顧客一覧'), false);
  assert.equal(serialized.includes('design.xlsx'), false);
  assert.equal(record.final.text, undefined);
  assert.equal(record.ms, 3200);
  assert.deepEqual(record.picked, { rank: 1, fit: 0.4, basis: 'near-miss' });
});

test('includeText is explicit and adds only the final query text', () => {
  const record = buildSearchObservation({
    finalQuery: 'ACME顧客一覧',
    result: result('no-match'),
    queries: 1,
    outcome: 'cancelled',
    startedAtMs: 0,
    endedAtMs: 10,
    localDate: '2026-10-08',
    includeText: true,
  });
  assert.equal(record.final.text, 'ACME顧客一覧');
});

test('store keeps only the newest 1000 records and can be cleared', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-search-observation-'));
  const file = path.join(root, 'observations.json');
  for (let i = 0; i < 1005; i += 1) {
    appendSearchObservation(file, observation(`2026-10-${String((i % 8) + 1).padStart(2, '0')}`, i));
  }
  const store = readSearchObservationStore(file);
  assert.equal(store.records.length, 1000);
  assert.equal(store.records[0].ms, 5);
  assert.equal(store.records.at(-1)?.ms, 1004);

  clearSearchObservations(file);
  assert.equal(fs.existsSync(file), false);
  assert.deepEqual(readSearchObservationStore(file).records, []);
});

test('summary exports counts only and calibrates fit and aliases', () => {
  const records: SearchObservationRecord[] = [
    {
      ...observation('2026-10-01', 100),
      final: { status: 'no-match', class: 'description', tokens: 4, latinWords: 0, question: true },
      outcome: 'picked-near-miss',
      picked: { rank: 1, fit: 0.4, basis: 'near-miss' },
      alias: 'offered-accepted',
    },
    {
      ...observation('2026-10-02', 200),
      final: { status: 'no-match', class: 'description', tokens: 3, latinWords: 0, question: true },
      outcome: 'cancelled',
      alias: 'none',
    },
    {
      ...observation('2026-10-03', 300),
      final: { status: 'candidates', class: 'found', tokens: 2, latinWords: 1, question: false },
      outcome: 'picked-candidate',
      picked: { rank: 2, fit: 0.95, basis: 'name' },
      alias: 'offered-declined',
    },
  ];
  const summary = summarizeSearchObservations(records);
  assert.equal(summary.records, 3);
  assert.equal(summary.from, '2026-10-01');
  assert.equal(summary.to, '2026-10-03');
  assert.equal(summary.alias.offered, 2);
  assert.equal(summary.alias.accepted, 1);
  assert.equal(summary.alias.acceptanceRate, 0.5);
  assert.equal(summary.fitCalibration.find((item) => item.bucket === '<0.5')?.rank1Rate, 1);
  assert.equal(summary.fitCalibration.find((item) => item.bucket === '>=0.9')?.rank1Rate, 0);

  const markdown = renderSearchObservationSummaryMarkdown(summary);
  assert.match(markdown, /分類 × 結末/u);
  assert.match(markdown, /description/u);
  assert.doesNotMatch(markdown, /ACME|design\.xlsx|機密/u);
});

function observation(at: string, ms: number): SearchObservationRecord {
  return {
    schema: 'mmi.search-observation/v1',
    classifierVersion: 1,
    at,
    queries: 1,
    final: {
      status: 'no-match',
      class: 'no-such-table',
      tokens: 2,
      latinWords: 0,
      question: false,
    },
    outcome: 'cancelled',
    alias: 'none',
    ms,
  };
}


test('building an observation does not mutate the search result or its ranking', () => {
  const first = candidate('第一候補', { fit: 0.8 });
  const second = candidate('第二候補', { fit: 0.6 });
  const search: CompileResult = {
    status: 'candidates',
    ir: { input: '候補を探す' } as CompileResult['ir'],
    candidates: [first, second],
    reasons: [],
    requiresSelection: true,
  };
  const before = JSON.stringify(search);

  buildSearchObservation({
    finalQuery: '候補を探す',
    result: search,
    queries: 1,
    outcome: 'picked-candidate',
    picked: { candidate: second, rank: 2 },
    startedAtMs: 0,
    endedAtMs: 10,
    localDate: '2026-10-08',
  });

  assert.equal(JSON.stringify(search), before);
  assert.deepEqual(search.candidates.map((item) => item.region.title), [
    '第一候補',
    '第二候補',
  ]);
});
