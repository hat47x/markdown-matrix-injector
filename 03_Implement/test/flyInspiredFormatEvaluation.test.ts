import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  matchFormatObservation,
  type FormatMatchOptions,
  type FormatMatchStatus,
  type FormatPrototype,
} from '../src/experimental/flyInspiredFormatMatcher.js';

type CaseClass = 'known' | 'ambiguous' | 'novel';

interface EvaluationCase {
  id: string;
  class: CaseClass;
  features: string[];
  expectedStatus: FormatMatchStatus;
  expectedWinner?: string;
}

interface EvaluationFixture {
  options: FormatMatchOptions;
  prototypes: FormatPrototype[];
  cases: EvaluationCase[];
}

const fixtureUrl = new URL('./fixtures/fly-format-evaluation.json', import.meta.url);
const fixture = JSON.parse(fs.readFileSync(fixtureUrl, 'utf8')) as EvaluationFixture;

function runFixture() {
  return fixture.cases.map((entry) => ({
    entry,
    result: matchFormatObservation(entry.features, fixture.prototypes, fixture.options),
  }));
}

test('fly-format fixture has unique ids and the planned class distribution', () => {
  assert.equal(new Set(fixture.prototypes.map((prototype) => prototype.id)).size, 4);
  assert.equal(new Set(fixture.cases.map((entry) => entry.id)).size, 12);

  const counts = fixture.cases.reduce<Record<CaseClass, number>>(
    (acc, entry) => {
      acc[entry.class] += 1;
      return acc;
    },
    { known: 0, ambiguous: 0, novel: 0 },
  );
  assert.deepEqual(counts, { known: 8, ambiguous: 1, novel: 3 });
});

test('known formats match the expected prototype in all eight cases', () => {
  const known = runFixture().filter(({ entry }) => entry.class === 'known');
  assert.equal(known.length, 8);

  for (const { entry, result } of known) {
    assert.equal(result.status, entry.expectedStatus, entry.id);
    assert.equal(result.winner?.prototypeId, entry.expectedWinner, entry.id);
  }
});

test('novel formats are never falsely accepted as matched', () => {
  const novel = runFixture().filter(({ entry }) => entry.class === 'novel');
  assert.equal(novel.length, 3);

  for (const { entry, result } of novel) {
    assert.equal(result.status, 'novel', entry.id);
    assert.equal(result.winner, undefined, entry.id);
  }
});

test('missing discriminating feature stays ambiguous instead of forcing a winner', () => {
  const ambiguous = runFixture().filter(({ entry }) => entry.class === 'ambiguous');
  assert.equal(ambiguous.length, 1);
  assert.equal(ambiguous[0]?.result.status, 'ambiguous');
  assert.equal(ambiguous[0]?.result.winner, undefined);
  assert.equal(ambiguous[0]?.result.candidates[0]?.confidence, ambiguous[0]?.result.candidates[1]?.confidence);
});

test('evaluation is deterministic across repeated runs', () => {
  const baseline = JSON.stringify(runFixture().map(({ result }) => result));
  for (let index = 0; index < 10; index += 1) {
    assert.equal(JSON.stringify(runFixture().map(({ result }) => result)), baseline);
  }
});
