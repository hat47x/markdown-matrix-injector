import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  buildQueryEvidenceCsv,
  buildQueryEvidenceJson,
  buildQueryEvidenceMarkdown,
  buildQueryEvidenceExportArtifacts,
  buildQueryEvidenceOutputPaths,
  collectQueryEvidenceRecords,
} from '../src/dx/vscodeAdapters.js';

function getSourceMetadataLine(markdown: string): string | undefined {
  return markdown.split('\n').find((line) => line.startsWith('- Source: '));
}

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

test('collectQueryEvidenceRecords returns empty array when markdown has no embeds', () => {
  const records = collectQueryEvidenceRecords('# Title\nNo embed syntax in this document.');
  assert.deepEqual(records, []);
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

test('buildQueryEvidenceMarkdown renders a stable markdown table payload', () => {
  const markdown = buildQueryEvidenceMarkdown([
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
      query: '',
      raw: '![[data/b.csv]]',
    },
  ]);

  assert.equal(
    markdown,
    [
      '## Query Evidence Report',
      '',
      '- Total records: 2',
      '',
      '| index | filepath | target | range | query | raw |',
      '| --- | --- | --- | --- | --- | --- |',
      '| 1 | data/a.csv | Sheet1 | A1:B2 | mode=table&header=first | ![[data/a.csv#Sheet1\\|A1:B2?mode=table&header=first]] |',
      '| 2 | data/b.csv | - | - | - | ![[data/b.csv]] |',
    ].join('\n'),
  );
});

test('buildQueryEvidenceMarkdown renders an explicit empty-state report', () => {
  assert.equal(
    buildQueryEvidenceMarkdown([]),
    ['## Query Evidence Report', '', '- Total records: 0', '', '_No evidence records found._'].join('\n'),
  );
});

test('buildQueryEvidenceMarkdown keeps source metadata in empty-state reports when explicitly provided', () => {
  assert.equal(
    buildQueryEvidenceMarkdown([], { sourceName: ' \n ' }),
    ['## Query Evidence Report', '', '- Source: unknown-source', '- Total records: 0', '', '_No evidence records found._'].join('\n'),
  );
});

test('buildQueryEvidenceMarkdown includes source metadata when requested', () => {
  const markdown = buildQueryEvidenceMarkdown(
    [{ index: 1, filepath: 'data/a.csv', target: '', range: '', query: '', raw: '![[data/a.csv]]' }],
    { sourceName: 'spec' },
  );
  assert.match(markdown, /- Source: spec/);
});

test('buildQueryEvidenceMarkdown normalizes and escapes source metadata variants', async (t) => {
  const cases = [
    { name: 'multiline normalization', sourceName: 'spec\r\nv2\nfinal', expected: '- Source: spec v2 final' },
    { name: 'whitespace-only fallback', sourceName: ' \r\n\t ', expected: '- Source: unknown-source' },
    { name: 'empty-string fallback', sourceName: '', expected: '- Source: unknown-source' },
    { name: 'markdown escaping', sourceName: 'spec`v2` [x]', expected: '- Source: spec\\`v2\\` \\[x\\]' },
    { name: 'plain punctuation readability', sourceName: 'spec-v2 (draft)+final!', expected: '- Source: spec-v2 (draft)+final!' },
    { name: 'html escaping', sourceName: '<b>Spec & Plan</b>', expected: '- Source: &lt;b&gt;Spec &amp; Plan&lt;/b&gt;' },
    { name: 'preserve intentional spaces', sourceName: 'spec  v2   final', expected: '- Source: spec  v2   final' },
    { name: 'collapse newline boundaries', sourceName: 'spec   \n   v2', expected: '- Source: spec v2' },
    { name: 'tab normalization', sourceName: 'spec\tv2\tfinal', expected: '- Source: spec v2 final' },
    { name: 'control-character normalization', sourceName: 'spec\u0000v2\u0007final', expected: '- Source: spec v2 final' },
  ] satisfies ReadonlyArray<{ name: string; sourceName: string; expected: string }>;

  for (const scenario of cases) {
    await t.test(scenario.name, () => {
      const markdown = buildQueryEvidenceMarkdown(
        [{ index: 1, filepath: 'data/a.csv', target: '', range: '', query: '', raw: '![[data/a.csv]]' }],
        { sourceName: scenario.sourceName },
      );
      assert.equal(getSourceMetadataLine(markdown), scenario.expected);
    });
  }
});

test('buildQueryEvidenceMarkdown omits source metadata line when sourceName is not provided', () => {
  const markdown = buildQueryEvidenceMarkdown(
    [{ index: 1, filepath: 'data/a.csv', target: '', range: '', query: '', raw: '![[data/a.csv]]' }],
    {},
  );
  assert.equal(markdown.includes('- Source:'), false);
});

test('buildQueryEvidenceMarkdown falls back to unknown-source when sourceName is explicitly undefined', () => {
  const markdown = buildQueryEvidenceMarkdown(
    [{ index: 1, filepath: 'data/a.csv', target: '', range: '', query: '', raw: '![[data/a.csv]]' }],
    { sourceName: undefined },
  );
  assert.equal(getSourceMetadataLine(markdown), '- Source: unknown-source');
});

test('buildQueryEvidenceMarkdown safely stringifies non-string sourceName values at runtime', () => {
  const markdown = buildQueryEvidenceMarkdown(
    [{ index: 1, filepath: 'data/a.csv', target: '', range: '', query: '', raw: '![[data/a.csv]]' }],
    { sourceName: 2026 as unknown as string },
  );
  assert.equal(getSourceMetadataLine(markdown), '- Source: 2026');
});

test('buildQueryEvidenceOutputPaths scopes all output files by markdown basename', () => {
  const outputs = buildQueryEvidenceOutputPaths('/workspace/docs/spec.md');
  assert.deepEqual(outputs, {
    csvOutputPath: '/workspace/docs/spec.query-evidence.csv',
    jsonOutputPath: '/workspace/docs/spec.query-evidence.json',
    markdownOutputPath: '/workspace/docs/spec.query-evidence.md',
  });
});

test('buildQueryEvidenceOutputPaths sanitizes basename characters for stable filenames', () => {
  const outputs = buildQueryEvidenceOutputPaths('/workspace/docs/My Spec (v1).md');
  assert.deepEqual(outputs, {
    csvOutputPath: '/workspace/docs/My-Spec-v1.query-evidence.csv',
    jsonOutputPath: '/workspace/docs/My-Spec-v1.query-evidence.json',
    markdownOutputPath: '/workspace/docs/My-Spec-v1.query-evidence.md',
  });
});

test('buildQueryEvidenceOutputPaths falls back to markdown when basename sanitizes to empty', () => {
  const outputs = buildQueryEvidenceOutputPaths('/workspace/docs/!!!.md');
  assert.deepEqual(outputs, {
    csvOutputPath: '/workspace/docs/markdown.query-evidence.csv',
    jsonOutputPath: '/workspace/docs/markdown.query-evidence.json',
    markdownOutputPath: '/workspace/docs/markdown.query-evidence.md',
  });
});

test('buildQueryEvidenceOutputPaths preserves unicode letters and numbers in basename', () => {
  const outputs = buildQueryEvidenceOutputPaths('/workspace/docs/設計書_2026版.md');
  assert.deepEqual(outputs, {
    csvOutputPath: '/workspace/docs/設計書_2026版.query-evidence.csv',
    jsonOutputPath: '/workspace/docs/設計書_2026版.query-evidence.json',
    markdownOutputPath: '/workspace/docs/設計書_2026版.query-evidence.md',
  });
});

test('buildQueryEvidenceOutputPaths keeps unicode while normalizing symbols to hyphen', () => {
  const outputs = buildQueryEvidenceOutputPaths('/workspace/docs/設計!書@2026?.md');
  assert.deepEqual(outputs, {
    csvOutputPath: '/workspace/docs/設計-書-2026.query-evidence.csv',
    jsonOutputPath: '/workspace/docs/設計-書-2026.query-evidence.json',
    markdownOutputPath: '/workspace/docs/設計-書-2026.query-evidence.md',
  });
});

test('buildQueryEvidenceOutputPaths resolves basename for windows-style paths', () => {
  const outputs = buildQueryEvidenceOutputPaths('C:\\workspace\\docs\\spec.md');
  assert.deepEqual(outputs, {
    csvOutputPath: 'C:\\workspace\\docs\\spec.query-evidence.csv',
    jsonOutputPath: 'C:\\workspace\\docs\\spec.query-evidence.json',
    markdownOutputPath: 'C:\\workspace\\docs\\spec.query-evidence.md',
  });
});


test('buildQueryEvidenceOutputPaths avoids Windows reserved basenames', () => {
  const outputs = buildQueryEvidenceOutputPaths('/workspace/docs/CON.md');
  assert.deepEqual(outputs, {
    csvOutputPath: '/workspace/docs/CON-file.query-evidence.csv',
    jsonOutputPath: '/workspace/docs/CON-file.query-evidence.json',
    markdownOutputPath: '/workspace/docs/CON-file.query-evidence.md',
  });
});

test('buildQueryEvidenceOutputPaths avoids Windows reserved basenames even when fallback basename is used', () => {
  const outputs = buildQueryEvidenceOutputPaths('/workspace/docs/!!!.md');
  assert.doesNotMatch(outputs.csvOutputPath, /\/con\.query-evidence\.csv$/i);
  assert.match(outputs.csvOutputPath, /\/markdown\.query-evidence\.csv$/);
});

test('buildQueryEvidenceOutputPaths caps sanitized basename length to 64 characters', () => {
  const source = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890---extra';
  const normalized = source.replaceAll(/[^\p{L}\p{N}_-]/gu, '-').replaceAll(/-+/g, '-').replaceAll(/^-|-$/g, '');
  const hashSuffix = createHash('sha1').update(normalized).digest('hex').slice(0, 6);
  const expectedPrefix = `${normalized.slice(0, 57).replace(/-$/g, '')}-${hashSuffix}`.replace(/^-|-$/g, '');
  const outputs = buildQueryEvidenceOutputPaths(`/workspace/docs/${source}.md`);
  assert.deepEqual(outputs, {
    csvOutputPath: `/workspace/docs/${expectedPrefix}.query-evidence.csv`,
    jsonOutputPath: `/workspace/docs/${expectedPrefix}.query-evidence.json`,
    markdownOutputPath: `/workspace/docs/${expectedPrefix}.query-evidence.md`,
  });
  assert.equal(expectedPrefix.length <= 64, true);
});

test('buildQueryEvidenceOutputPaths uses hash suffix to avoid collisions for long similar basenames', () => {
  const basePrefix = 'a'.repeat(57);
  const first = buildQueryEvidenceOutputPaths(`/workspace/docs/${basePrefix}1111111111.md`);
  const second = buildQueryEvidenceOutputPaths(`/workspace/docs/${basePrefix}2222222222.md`);

  assert.notEqual(first.csvOutputPath, second.csvOutputPath);
  assert.match(first.csvOutputPath, new RegExp(`/workspace/docs/${basePrefix}-[a-f0-9]{6}\\.query-evidence\\.csv$`));
  assert.match(second.csvOutputPath, new RegExp(`/workspace/docs/${basePrefix}-[a-f0-9]{6}\\.query-evidence\\.csv$`));
});

test('buildQueryEvidenceExportArtifacts builds records, payloads, and scoped output paths together', () => {
  const artifacts = buildQueryEvidenceExportArtifacts(
    '![[data/a.csv#Sheet1|A1:B2?mode=table]]',
    '/workspace/docs/spec.md',
  );

  assert.equal(artifacts.records.length, 1);
  assert.equal(artifacts.sourceName, 'spec');
  assert.equal(artifacts.csvOutputPath, '/workspace/docs/spec.query-evidence.csv');
  assert.equal(artifacts.jsonOutputPath, '/workspace/docs/spec.query-evidence.json');
  assert.equal(artifacts.markdownOutputPath, '/workspace/docs/spec.query-evidence.md');
  assert.match(artifacts.csvText, /^index,filepath,target,range,query,raw/m);
  assert.match(artifacts.jsonText, /"filepath": "data\/a\.csv"/);
  assert.match(artifacts.markdownReportText, /## Query Evidence Report/);
  assert.match(artifacts.markdownReportText, /- Source: spec/);
});

test('buildQueryEvidenceExportArtifacts keeps source metadata basename for windows-style paths', () => {
  const artifacts = buildQueryEvidenceExportArtifacts(
    '![[data/a.csv#Sheet1|A1:B2?mode=table]]',
    'C:\\workspace\\docs\\spec.md',
  );

  assert.equal(artifacts.sourceName, 'spec');
  assert.match(artifacts.markdownReportText, /- Source: spec/);
});
