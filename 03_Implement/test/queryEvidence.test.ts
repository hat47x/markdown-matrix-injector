import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQueryEvidenceCsv, buildQueryEvidenceJson, collectQueryEvidenceRecords } from '../src/dx/vscodeAdapters.js';

test('collectQueryEvidenceRecords preserves document appearance order', () => {
  const markdown = [
    'Intro',
    '![[data/a.csv#Sheet1|A1:B2?mode=table&header=first]]',
    'middle ![[data/b.xlsx#Summary|C3:D9?grep=AUTH]] text',
  ].join('\n');

  const records = collectQueryEvidenceRecords(markdown);

  assert.equal(records.length, 2);
  assert.deepEqual(
    records.map((record) => ({ index: record.index, filepath: record.filepath, target: record.target, range: record.range })),
    [
      { index: 1, filepath: 'data/a.csv', target: 'Sheet1', range: 'A1:B2' },
      { index: 2, filepath: 'data/b.xlsx', target: 'Summary', range: 'C3:D9' },
    ],
  );
});

test('buildQueryEvidenceCsv renders stable CSV header and escapes raw/query fields', () => {
  const csv = buildQueryEvidenceCsv([
    {
      index: 1,
      filepath: 'data/a.csv',
      target: 'Sheet1',
      range: 'A1:B2',
      query: 'mode=table&header=first',
      raw: '![[data/a.csv#Sheet1|A1:B2?mode=table&header=first]]',
    },
    {
      index: 2,
      filepath: 'data/b.csv',
      target: '',
      range: '',
      query: 'grep="AUTH"',
      raw: '![[data/b.csv?grep="AUTH"]]',
    },
  ]);

  assert.equal(
    csv,
    [
      'index,filepath,target,range,query,raw',
      '1,data/a.csv,Sheet1,A1:B2,mode=table&header=first,![[data/a.csv#Sheet1|A1:B2?mode=table&header=first]]',
      '2,data/b.csv,,,"grep=""AUTH""","![[data/b.csv?grep=""AUTH""]]"',
    ].join('\n'),
  );
});

test('buildQueryEvidenceJson renders a stable pretty JSON payload', () => {
  const records = collectQueryEvidenceRecords('![[data/a.csv#Sheet1|A1:B2?mode=table]]\n![[data/b.csv?grep=AUTH]]');

  assert.equal(
    buildQueryEvidenceJson(records),
    JSON.stringify(
      [
        {
          index: 1,
          filepath: 'data/a.csv',
          target: 'Sheet1',
          range: 'A1:B2',
          query: 'mode=table',
          raw: '![[data/a.csv#Sheet1|A1:B2?mode=table]]',
        },
        {
          index: 2,
          filepath: 'data/b.csv',
          target: '',
          range: '',
          query: 'grep=AUTH',
          raw: '![[data/b.csv?grep=AUTH]]',
        },
      ],
      null,
      2,
    ),
  );
});
