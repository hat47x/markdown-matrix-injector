import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SheetSource, SourceCell } from '../src/core/sheetSource.js';
import { analyzeCompletionContext, type CompletionContext } from '../src/dx/completionContext.js';
import {
  PARAMETER_DOCS_JA,
  jaCompletionPhrases,
  paramKeyCandidates,
  paramValueCandidates,
  rangeCandidates,
  regionForRange,
} from '../src/dx/completionCandidates.js';
import { MMI_KNOWN_PARAMETER_CONTRACT } from '../src/parser/parameterContract.js';

/** `|` in the fixture marks the cursor. */
function at(fixture: string): CompletionContext | undefined {
  const offset = fixture.indexOf('|CURSOR|');
  return analyzeCompletionContext(fixture.replace('|CURSOR|', ''), offset);
}

function replaced(fixture: string, insert: string): string {
  const offset = fixture.indexOf('|CURSOR|');
  const text = fixture.replace('|CURSOR|', '');
  const context = analyzeCompletionContext(text, offset)!;
  return text.slice(0, context.replaceStart) + insert + text.slice(context.replaceEnd);
}

test('context: stages across an unfinished embed', () => {
  assert.equal(at('![[da|CURSOR|')?.stage, 'filepath');
  assert.equal(at('![[a.xlsx#Sh|CURSOR|')?.stage, 'sheet');
  assert.equal(at('![[a.xlsx#Sheet1||CURSOR|')?.stage, 'range');
  assert.equal(at('![[a.xlsx#S|A1:B2?he|CURSOR|')?.stage, 'param-key');
  const value = at('![[a.xlsx#S|A1:B2?mode=table&header=f|CURSOR|');
  assert.deepEqual([value?.stage, value?.paramKey, value?.typed, value?.usedParams], ['param-value', 'header', 'f', ['mode']]);
});

test('context: only the token under the cursor is replaced; the rest survives', () => {
  assert.equal(replaced('前 ![[a.xlsx#Sh|CURSOR|eet9|A1:B2?mode=card]] 後', 'Summary'), '前 ![[a.xlsx#Summary|A1:B2?mode=card]] 後');
  assert.equal(replaced('![[a.xlsx#S|A1:B2?mode=ta|CURSOR|ble&x-foo=1]]', 'card'), '![[a.xlsx#S|A1:B2?mode=card&x-foo=1]]');
  assert.equal(replaced('![[a.xlsx#S|A1|CURSOR|:B2?grep=x]]', 'C5:F12'), '![[a.xlsx#S|C5:F12?grep=x]]');
  assert.equal(replaced('![[./d|CURSOR|ata/a.xlsx#S]]', './data/b.xlsx'), '![[./data/b.xlsx#S]]');
});

test('context: nothing inside code or after a closed embed', () => {
  assert.equal(at('```\n![[a.xlsx#|CURSOR|\n```'), undefined);
  assert.equal(at('~~~md\n![[a|CURSOR|'), undefined);
  assert.equal(at('`![[a.xlsx#|CURSOR|`'), undefined);
  assert.equal(at('![[a.xlsx#S]] and |CURSOR|'), undefined);
  assert.equal(at('plain |CURSOR|text'), undefined);
  assert.equal(at('```\ncode\n```\n![[a.xlsx#|CURSOR|')?.stage, 'sheet');
});

test('keys: used keys are hidden except repeatable formatColumn; descriptions are Japanese', () => {
  const context = at('![[a.xlsx#S|A1:B2?mode=card&formatColumn=E:json&|CURSOR|')!;
  const labels = paramKeyCandidates(context, jaCompletionPhrases).map((c) => c.label);
  assert.ok(!labels.includes('mode'));
  assert.ok(labels.includes('formatColumn'));
  assert.ok(labels.includes('orientation'));
  assert.match(paramKeyCandidates(at('![[a.xlsx#S|A1?gr|CURSOR|')!, jaCompletionPhrases)[0].detail!, /部分一致/u);
});

test('values: enum vocabulary from the contract', () => {
  const values = (fixture: string) => paramValueCandidates(at(fixture)!, undefined, jaCompletionPhrases).map((c) => c.label);
  assert.deepEqual(values('![[a.xlsx#S|A1?orientation=|CURSOR|'), ['landscape', 'portrait']);
  assert.deepEqual(values('![[a.xlsx#S|A1?header=|CURSOR|'), ['first', 'none']);
  assert.deepEqual(values('![[a.xlsx#S|A1?pageBreak=a|CURSOR|'), ['after']);
  assert.deepEqual(values('![[a.xlsx#S|A1?x-unknown=|CURSOR|'), []);
});

test('schema sync: contract, schema file and Japanese docs describe the same vocabulary', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const schema = JSON.parse(fs.readFileSync(path.join(here, '../../04_Documentation/spec/params.schema.json'), 'utf8'));
  const keys = Object.keys(schema.properties).sort();
  assert.deepEqual(Object.keys(MMI_KNOWN_PARAMETER_CONTRACT).sort(), keys);
  assert.deepEqual(Object.keys(PARAMETER_DOCS_JA).sort(), keys);
  for (const key of keys) {
    const constraint = MMI_KNOWN_PARAMETER_CONTRACT[key as keyof typeof MMI_KNOWN_PARAMETER_CONTRACT].constraint;
    if (schema.properties[key].enum) {
      assert.deepEqual(constraint.kind === 'enum' ? [...constraint.values] : [], schema.properties[key].enum, key);
      for (const value of schema.properties[key].enum) assert.ok(PARAMETER_DOCS_JA[key as 'mode'].values?.[value], `${key}=${value}`);
    }
    if (schema.properties[key].pattern) assert.equal(constraint.kind === 'pattern' ? constraint.source : '', schema.properties[key].pattern, key);
  }
});

function sheet(cells: Record<string, string>): SheetSource {
  const map = new Map<string, SourceCell>();
  let used = { startRow: Infinity, startCol: Infinity, endRow: -1, endCol: -1 };
  for (const [ref, text] of Object.entries(cells)) {
    const [, letters, digits] = /^([A-Z]+)(\d+)$/u.exec(ref)!;
    const col = letters.charCodeAt(0) - 65;
    const row = Number(digits) - 1;
    const numeric = /^\d+$/u.test(text);
    map.set(`${row},${col}`, { text, type: numeric ? 'n' : 's', value: numeric ? Number(text) : text });
    used = { startRow: Math.min(used.startRow, row), startCol: Math.min(used.startCol, col), endRow: Math.max(used.endRow, row), endCol: Math.max(used.endCol, col) };
  }
  return { usedRange: used, merges: [], cellAt: (r, c) => map.get(`${r},${c}`) };
}

const STATES = sheet({
  B1: '状態遷移表',
  B3: 'ID', C3: '操作', D3: '遷移先',
  B4: '1', C4: '申請', D4: '申請中',
  B5: '2', C5: '承認', D5: '承認済',
});

test('ranges: detected regions of the selected sheet first, explained by title and headers', () => {
  const candidates = rangeCandidates(at('![[a.xlsx#状態遷移||CURSOR|')!, '状態遷移', STATES, jaCompletionPhrases);
  assert.equal(candidates[0].label, 'B3:D5');
  assert.match(candidates[0].detail!, /状態遷移表 \/ ID・操作・遷移先/u);
  assert.ok(candidates.some((c) => c.label === 'B1:D5' && /使用範囲/u.test(c.detail!)));
  assert.deepEqual(rangeCandidates(at('![[a.xlsx#状態遷移|遷移|CURSOR|')!, '状態遷移', STATES, jaCompletionPhrases).map((c) => c.label), ['B3:D5']);
});

test('values: columns offer relative letters with header names and extend a list', () => {
  const region = regionForRange('状態遷移', STATES, 'B3:D5');
  const first = paramValueCandidates(at('![[a.xlsx#状態遷移|B3:D5?columns=|CURSOR|')!, region, jaCompletionPhrases);
  assert.deepEqual(first.map((c) => [c.label, c.detail]), [['A', 'ID'], ['B', '操作'], ['C', '遷移先']]);
  const more = paramValueCandidates(at('![[a.xlsx#状態遷移|B3:D5?columns=A,|CURSOR|')!, region, jaCompletionPhrases);
  assert.deepEqual(more.map((c) => c.label), ['A,B', 'A,C']);
});

test('context: an embed without a range still completes its query (spec: range is optional)', () => {
  const context = at('![[a.xlsx#Sheet1?mode=card&he|CURSOR|]]')!;
  assert.deepEqual([context.stage, context.sheet, context.range, context.usedParams], ['param-key', 'Sheet1', undefined, ['mode']]);
  assert.equal(at('![[a.csv?header=|CURSOR|')?.stage, 'param-value');
});
