import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { readDocx } from '../src/adapters/docxSourceAdapter.js';
import { candidateProblem } from '../src/core/candidate.js';

const fixture = fileURLToPath(new URL('./fixtures/docx/sample.docx', import.meta.url));

test('a document authored with a real WordprocessingML producer is read without guessed structure', () => {
  const bytes = fs.readFileSync(fixture);
  const result = readDocx(bytes, './sample.docx');
  assert.equal(result.documentReadable, true);
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(
    result.headings.map((heading) => [heading.level, heading.text, heading.structuralPath]),
    [
      [1, '基本設計', '/body/p[1]'],
      [2, '方式', '/body/p[3]'],
    ],
  );
  assert.deepEqual(
    [result.tables.length, result.tables[0].rows, result.tables[0].columns, result.tables[0].explicitHeaderRow],
    [1, 3, 2, 1],
  );
  assert.deepEqual(result.tables[0].grid, [
    ['項目', '内容'],
    ['方式', '段階移行'],
    ['範囲', 'A1:B2'],
  ]);
  assert.equal(result.images.length, 1);
  assert.deepEqual(
    [result.images[0].format, result.images[0].extractable, result.images[0].structuralPath],
    ['png', true, '/body/p[5]/drawing[1]'],
  );
  assert.ok(result.candidates.every((candidate) => candidateProblem(candidate) === undefined));
});
