import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { Candidate, CompileResult } from '../src/search/nlQuery/compiler.js';
import { classifySearchObservation, latinWordsOf } from '../src/search/observation/classify.js';
import {
  appendSearchObservation,
  clearSearchObservations,
  readSearchObservationStore,
} from '../src/search/observation/store.js';
import {
  MIN_UNRESOLVED_FOR_CONCLUSION,
  renderSearchObservationSummaryMarkdown,
  summarizeSearchObservations,
} from '../src/search/observation/summary.js';
import {
  SEARCH_OBSERVATION_CLASSIFIER_VERSION,
  SEARCH_OBSERVATION_SCHEMA,
  type SearchObservationClass,
  type SearchObservationRecord,
} from '../src/search/observation/types.js';

// Regression tests for the defects found in review of the search-observation feature (issue-0207),
// written against the origin/main API so the merged code keeps the fixes.

function candidate(title: string, extra: Partial<Candidate> & { headers?: string[] } = {}): Candidate {
  const { headers, ...rest } = extra;
  return {
    region: {
      id: `/ws/design.xlsx#Sheet1!A1:B2`,
      bookPath: '/ws/design.xlsx',
      bookStem: 'design',
      sheet: 'Sheet1',
      title,
      a1: 'A1:B2',
      headers: headers ?? ['列1', '列2'],
    },
    markdown: '',
    explanation: '',
    retrievalScore: 1,
    coverage: 1,
    columns: [],
    partial: false,
    notes: [],
    ...rest,
  } as unknown as Candidate;
}

const noMatch = (nearMisses: Candidate[] = []): CompileResult =>
  ({ status: 'no-match', candidates: [], nearMisses, reasons: [], requiresSelection: true, ir: {} }) as unknown as CompileResult;

const record = (cls: SearchObservationClass, extra: Partial<SearchObservationRecord> = {}): SearchObservationRecord => ({
  schema: SEARCH_OBSERVATION_SCHEMA,
  classifierVersion: SEARCH_OBSERVATION_CLASSIFIER_VERSION,
  at: '2026-10-09',
  queries: 1,
  final: { status: 'no-match', class: cls, tokens: 2, latinWords: 0, question: false },
  outcome: 'cancelled',
  alias: 'none',
  ms: 10,
  ...extra,
});

function tempFile(name: string): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-obs-fix-')), name);
}

test('turning includeText off removes request text that earlier records kept', () => {
  const file = tempFile('search-observations.json');
  const withText = record('found', { final: { status: 'candidates', class: 'found', tokens: 3, latinWords: 0, question: false, text: '山田商事の人事表' } });
  appendSearchObservation(file, withText, undefined, { keepText: true });
  assert.match(fs.readFileSync(file, 'utf8'), /山田商事/u);

  const next = appendSearchObservation(file, record('no-such-table'), undefined, { keepText: false });
  assert.equal(next.records.length, 2);
  assert.ok(!fs.readFileSync(file, 'utf8').includes('山田商事'), 'the old request text must be gone from the file');
  assert.ok(next.records.every((item) => item.final.text === undefined));
});

test('a failed read never lets an append overwrite the stored records', (t) => {
  const file = tempFile('search-observations.json');
  appendSearchObservation(file, record('found'));
  appendSearchObservation(file, record('notation'));
  const before = fs.readFileSync(file, 'utf8');
  t.mock.method(fs, 'readFileSync', () => {
    throw Object.assign(new Error('resource busy'), { code: 'EBUSY' });
  });
  assert.throws(() => appendSearchObservation(file, record('other')), /resource busy/u);
  t.mock.restoreAll();
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'the stored file is untouched');
  assert.equal(readSearchObservationStore(file).records.length, 2);
});

test('clearing also removes a staging copy left by an interrupted write', () => {
  const file = tempFile('search-observations.json');
  appendSearchObservation(file, record('found'));
  fs.writeFileSync(`${file}.tmp-4242`, '{"records":[]}');
  clearSearchObservations(file);
  assert.equal(fs.existsSync(file), false);
  assert.equal(fs.existsSync(`${file}.tmp-4242`), false, 'a leftover staging copy must go too');
});

test('a Latin word counts only as a whole word of a near miss', () => {
  // "if" inside "Specification" is not the word IF.
  const result = noMatch([candidate('Specification一覧')]);
  assert.equal(classifySearchObservation('IFの表を貼りたい', result).class, 'abbreviation');
  // The word IS a whole word of the name, so nothing is unseen.
  assert.equal(classifySearchObservation('IFの表を貼りたい', noMatch([candidate('IF一覧')])).class, 'other');
});

test('a file name is not an abbreviation, and a trailing mark is not part of a word', () => {
  assert.deepEqual(latinWordsOf('設計書.xlsxの表'), []);
  assert.deepEqual(latinWordsOf('CBM.の表'), ['cbm']);
  assert.equal(classifySearchObservation('設計書.xlsxの表を貼りたい', noMatch()).class, 'no-such-table');
});

test('a long English word is one word, and a single unseen word is an abbreviation', () => {
  assert.deepEqual(latinWordsOf('SupplierOrderDetailHistoryの表'), ['supplierorderdetailhistory']);
  assert.equal(classifySearchObservation('SupplierOrderDetailHistoryの表を貼りたい', noMatch()).class, 'abbreviation');
});

test('a request with a near miss is never no-such-table (design section 4)', () => {
  const result = noMatch([candidate('在庫一覧')]);
  assert.equal(classifySearchObservation('在庫管理表を見せて', result).class, 'other');
});

test('the summary separates determined from undetermined unresolved sessions', () => {
  const records: SearchObservationRecord[] = [
    record('no-such-table'),
    record('other'),
    record('found', { outcome: 'picked-candidate', picked: { rank: 1, fit: 0.95, basis: 'name' } }),
    record('abbreviation', { outcome: 'picked-near-miss', picked: { rank: 1, fit: 0.4, basis: 'near-miss' } }),
  ];
  const summary = summarizeSearchObservations(records);
  assert.equal(summary.unresolved, 2, 'no-such-table and abbreviation are determined unresolved sessions');
  assert.equal(summary.undetermined, 1, 'other is counted separately');
  assert.equal(summary.fitCalibration.find((bin) => bin.bucket === '>=0.9')?.picked, 1);
  assert.equal(summary.fitCalibration.find((bin) => bin.bucket === '<0.5')?.picked, 1, 'the near-miss pick keeps its own fit bucket (origin behaviour)');
  const markdown = renderSearchObservationSummaryMarkdown(summary);
  assert.match(markdown, new RegExp(`${MIN_UNRESOLVED_FOR_CONCLUSION}件に満たない`, 'u'));
  assert.match(markdown, /原因を判定できなかったセッション: 1/u);
});
