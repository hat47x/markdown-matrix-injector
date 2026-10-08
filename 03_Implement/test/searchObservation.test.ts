import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Candidate, CompileResult } from '../src/search/nlQuery/compiler.js';
import { classifyResult, withinOneEdit } from '../src/search/observation/classify.js';
import { SearchSessionRecorder } from '../src/search/observation/record.js';
import { ObservationStore } from '../src/search/observation/store.js';
import { renderSummary, summarize } from '../src/search/observation/summary.js';
import { OBSERVATION_SCHEMA, type ObservationRecord } from '../src/search/observation/types.js';

const region = (sheet: string, extra: Record<string, unknown> = {}) => ({
  id: `/ws/b.xlsx#${sheet}!A1:B2`, bookPath: '/ws/b.xlsx', bookStem: 'b', sheet, a1: 'A1:B2', headers: ['列1', '列2'], ...extra,
});
const candidate = (sheet: string, extra: Partial<Candidate> = {}): Candidate => ({
  region: region(sheet), markdown: '', explanation: '', retrievalScore: 1, coverage: 1, columns: [], partial: false, notes: [], ...extra,
} as unknown as Candidate);
const result = (input: string, status: CompileResult['status'], parts: Partial<CompileResult> & { target?: string[] } = {}): CompileResult => ({
  status,
  ir: { input, target: (parts.target ?? []).map((text) => ({ text, quoted: false })) },
  candidates: [],
  reasons: [],
  requiresSelection: true,
  ...parts,
} as unknown as CompileResult);

test('each class is decided by a fixed rule', () => {
  assert.equal(classifyResult(result('配車計画の表', 'candidates', { candidates: [candidate('配車計画')] })).class, 'found');
  assert.equal(classifyResult(result('配車計画の表', 'candidates', { candidates: [candidate('配車計画', { basis: 'paraphrase' })] })).class, 'description');
  assert.equal(classifyResult(result('配車計画の合計', 'unsupported')).class, 'unsupported-op');
  assert.equal(classifyResult(result('', 'needs-more-input')).class, 'other');
  // A near miss that differs by one character of the name is a notation problem.
  assert.equal(classifyResult(result('配車計画票を貼りたい', 'no-match', { target: ['配車計画票'], nearMisses: [candidate('配車計画')] })).class, 'notation');
  // One Latin word that no table contains reads as an abbreviation.
  assert.equal(classifyResult(result('CBMの表を貼りたい', 'no-match', { nearMisses: [candidate('容積重量換算表')] })).class, 'abbreviation');
  assert.equal(classifyResult(result('CBMの表を貼りたい', 'no-match')).class, 'abbreviation');
  // Two unknown Latin words are not guessed at.
  assert.equal(classifyResult(result('CBMとDSPの表', 'no-match')).class, 'no-such-table');
  // A question that describes a table.
  assert.equal(classifyResult(result('誰に知らせるかが分かる表はどれ？', 'no-match')).class, 'description');
  assert.equal(classifyResult(result('在庫の棚卸表を貼りたい', 'no-match')).class, 'no-such-table');
});

test('the request is reduced to counts', () => {
  const c = classifyResult(result('CBM の 係数 を 貼りたい', 'no-match'));
  assert.equal(c.latinWords, 1);
  assert.ok(c.tokens >= 2);
  assert.equal(c.question, false);
  assert.equal(withinOneEdit('配車計画票', '配車計画'), true);
  assert.equal(withinOneEdit('配車計画', '配送計画表'), false);
  assert.equal(withinOneEdit('abc', 'abd'), false, 'too short to be a word');
});

test('a record holds no request text unless includeText is on, and never a table name', () => {
  const clock = (() => { let t = Date.parse('2026-10-08T09:00:00'); return () => (t += 1000); })();
  const secret = '極秘プロジェクトXの表';
  const plain = new SearchSessionRecorder({ clock });
  plain.onResult(result(secret, 'no-match', { nearMisses: [candidate('機密シート')] }), secret);
  plain.onPick({ source: 'near-miss', rank: 1, fit: 0.4, basis: 'name' });
  const record = plain.build('offered-accepted')!;
  const json = JSON.stringify(record);
  assert.ok(!json.includes('極秘'), 'request text must not be recorded');
  assert.ok(!json.includes('機密シート'), 'table name must not be recorded');
  assert.equal(record.schema, OBSERVATION_SCHEMA);
  assert.equal(record.outcome, 'picked-near-miss');
  assert.deepEqual(record.picked, { rank: 1, fit: 0.4, basis: 'name' });
  assert.equal(record.alias, 'offered-accepted');
  assert.equal(record.at, '2026-10-08');
  assert.equal(record.final.text, undefined);

  const withText = new SearchSessionRecorder({ includeText: true, clock });
  withText.onResult(result(secret, 'no-match'), secret);
  assert.equal(withText.build()!.final.text, secret);
});

test('the outcome follows what the person did, and an empty session records nothing', () => {
  const run = (setup: (r: SearchSessionRecorder) => void): ObservationRecord | undefined => {
    const recorder = new SearchSessionRecorder();
    setup(recorder);
    return recorder.build();
  };
  const found = result('配車計画', 'candidates', { candidates: [candidate('配車計画')] });
  assert.equal(run(() => undefined), undefined);
  assert.equal(run((r) => { r.onResult(found, 'a'); r.onPick({ source: 'candidate', rank: 1 }); })!.outcome, 'picked-candidate');
  assert.equal(run((r) => { r.onResult(found, 'a'); r.onResult(found, 'ab'); r.onPick({ source: 'candidate', rank: 2 }); })!.outcome, 'picked-after-edit');
  assert.equal(run((r) => { r.onResult(found, 'a'); })!.outcome, 'cancelled');
  assert.equal(run((r) => { r.onResult(found, 'a'); r.onResult(found, 'ab'); })!.queries, 2);
});

test('watching a result never changes it', () => {
  const frozen = result('配車計画の表', 'candidates', { candidates: [candidate('配車計画')] });
  const before = JSON.stringify(frozen);
  Object.freeze(frozen.candidates);
  const recorder = new SearchSessionRecorder();
  recorder.onResult(frozen, '配車計画の表');
  recorder.build();
  assert.equal(JSON.stringify(frozen), before);
});

function sample(overrides: Partial<ObservationRecord> & { class?: ObservationRecord['final']['class'] } = {}): ObservationRecord {
  const { class: cls, ...rest } = overrides;
  return {
    schema: OBSERVATION_SCHEMA, at: '2026-10-08', queries: 1,
    final: { status: 'no-match', class: cls ?? 'abbreviation', tokens: 2, latinWords: 1, question: false },
    outcome: 'cancelled', alias: 'none', ms: 100, ...rest,
  };
}

test('the store keeps the newest records, skips damaged lines, and can be cleared', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-observation-'));
  const file = path.join(dir, 'nested', 'search-observation.jsonl');
  const store = new ObservationStore(file, 5);
  for (let i = 0; i < 8; i += 1) assert.equal(await store.append(sample({ queries: i + 1 })), true);
  assert.deepEqual((await store.readAll()).map((r) => r.queries), [4, 5, 6, 7, 8]);
  fs.appendFileSync(file, 'not json\n{"schema":"other"}\n');
  assert.equal((await store.readAll()).length, 5);
  assert.equal(await store.clear(), true);
  assert.deepEqual(await store.readAll(), []);
  assert.equal(await store.clear(), false, 'nothing left to delete');
  assert.equal(fs.existsSync(file), false);
});

test('a store that cannot write reports failure instead of throwing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-observation-'));
  const blocker = path.join(dir, 'file');
  fs.writeFileSync(blocker, 'x');
  assert.equal(await new ObservationStore(path.join(blocker, 'sub', 'x.jsonl')).append(sample()), false);
});

test('the summary counts classes, outcomes, fit bins and alias offers, and shares no text', () => {
  const records = [
    sample({ class: 'found', outcome: 'picked-candidate', picked: { rank: 1, fit: 0.95, basis: 'name' } }),
    sample({ class: 'found', outcome: 'picked-candidate', picked: { rank: 2, fit: 0.92, basis: 'name' } }),
    sample({ class: 'abbreviation', outcome: 'picked-near-miss', picked: { rank: 1, fit: 0.4, basis: 'name' }, alias: 'offered-accepted' }),
    sample({ class: 'abbreviation', outcome: 'cancelled', alias: 'none' }),
    sample({ class: 'description', outcome: 'cancelled' }),
    sample({ class: 'abbreviation', outcome: 'picked-near-miss', picked: { rank: 1, fit: 0.4, basis: 'name' }, alias: 'offered-declined' }),
  ];
  const summary = summarize(records);
  assert.equal(summary.total, 6);
  assert.equal(summary.unresolved, 4);
  assert.equal(summary.byClass.abbreviation, 3);
  assert.equal(summary.matrix.abbreviation['picked-near-miss'], 2);
  assert.deepEqual(summary.fitBins.map((bin) => [bin.picked, bin.first]), [[2, 1], [0, 0], [0, 0], [2, 2]]);
  assert.deepEqual(summary.alias, { offered: 2, accepted: 1 });
  const text = renderSummary(summary);
  assert.match(text, /見つからなかったセッションが100件に満たない/u);
  assert.match(text, /略語らしい語/u);
  assert.equal(summary.from, '2026-10-08');
  assert.match(renderSummary(summarize([])), /記録件数: 0/u);
});
