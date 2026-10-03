import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import XLSX from 'xlsx';
import { findUnknownProseIds } from '../src/application/proseIdCheck.js';
import { checkPaths } from '../src/cli/mmi.js';
import { sheetSourceFromMatrix } from '../src/core/sheetSource.js';

const source = (rows: string[][]) => [{ label: './req.xlsx#要件', sheet: sheetSourceFromMatrix(rows) }];
const requirements = source([['ID', '名称'], ['REQ-001', '登録'], ['REQ-002', '照会'], ['REQ-003', '承認'], ['MSG-E001', 'エラー'], ['H2', '見出し']]);
const ids = (md: string, sources = requirements) => findUnknownProseIds(md, sources).map((f) => [f.id, f.line, f.column]);

test('an ID of a learned shape that no referenced cell has is reported with its position', () => {
  assert.deepEqual(ids('# 要件\n\nREQ-001 と REQ-099 を満たす。\n'), [['REQ-099', 3, 11]]);
});

test('known IDs, other shapes, inline code, code fences, links and reference lines are not reported', () => {
  const md = ['REQ-002 は承認機能。', 'H2 と UTF-8 は形式ではない。', '`REQ-099` はコード。', '[REQ-001](./REQ-097.md)', '```', 'REQ-096', '```', '![[./req.xlsx#要件|A1:B4]] REQ-095'].join('\n');
  assert.deepEqual(ids(md), []);
});

test('a shape needs three distinct values in the source, so a pair of codes never becomes an ID family', () => {
  const few = source([['ID'], ['AB-1'], ['AB-2']]);
  assert.deepEqual(ids('AB-9 は未定義。', few), []);
});

test('check reports it as a warning without failing the document', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-prose-id-'));
  const ws = XLSX.utils.aoa_to_sheet([['ID', '名称'], ['REQ-001', 'a'], ['REQ-002', 'b'], ['REQ-003', 'c']]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '要件');
  fs.writeFileSync(path.join(dir, 'req.xlsx'), XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  fs.writeFileSync(path.join(dir, 'doc.md'), '# 設計\n\n![[./req.xlsx#要件|A1:B4?header=first]]\n\nREQ-004 は旧仕様で削除された。\n');
  const problems = await checkPaths([path.join(dir, 'doc.md')], dir);
  const found = problems.filter((p) => p.code === 'MMI_PROSE_ID_NOT_IN_SOURCE');
  assert.equal(found.length, 1);
  assert.equal(found[0].severity, 'warning');
  assert.equal(found[0].line, 5);
  assert.match(found[0].message, /REQ-004/);
  assert.equal(problems.filter((p) => p.severity === 'error').length, 0);
});
