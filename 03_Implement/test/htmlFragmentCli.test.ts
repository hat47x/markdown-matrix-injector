import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { inspectSource } from '../src/cli/mmi.js';
import { candidateProblem } from '../src/core/candidate.js';

const fixture = new URL('./fixtures/html-fragment-v0/monolith.html', import.meta.url);
const file = decodeURIComponent(fixture.pathname);

test('CLI inspect returns HTML candidates without including unbounded serialized HTML', () => {
  const before = fs.readFileSync(fixture);
  const result = inspectSource(file, 0);
  assert.equal(result.candidates.length, 6);
  assert.deepEqual(
    result.htmlFragments?.map((item) => [item.tagName, item.id]),
    [
      ['main', 'spec'],
      ['section', 'overview'],
      ['figure', 'architecture'],
      ['section', 'api'],
      ['table', 'endpoints'],
      ['figure', 'sequence'],
    ],
  );
  assert.equal(result.htmlFragments?.filter((f) => f.kind === 'diagram').length, 2);
  assert.ok(result.candidates.every((candidate) => candidateProblem(candidate) === undefined));
  assert.ok(!JSON.stringify(result).includes('participant Client'));
  assert.deepEqual(fs.readFileSync(fixture), before);
});
