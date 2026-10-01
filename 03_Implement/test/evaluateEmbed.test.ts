import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { CooperativeTimeBudgetExceededError, type CooperativeTimeBudget } from '../src/core/cooperativeTimeBudget.js';
import { evaluateEmbed } from '../src/core/evaluateEmbed.js';

test('evaluateEmbed preserves the cooperative time-budget code from logical-table construction', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-evaluate-budget-'));
  const markdownFilePath = path.join(tempDir, 'spec.md');
  fs.writeFileSync(path.join(tempDir, 'roles.csv'), 'Name,Role\nAlice,Admin\n');

  const budget: CooperativeTimeBudget = {
    check() {
      throw new CooperativeTimeBudgetExceededError(12, 10);
    },
    consume() {},
  };
  const outcome = evaluateEmbed(
    {
      filepath: './roles.csv',
      target: 'Sheet1',
      range: 'A1:B2',
      params: new URLSearchParams('mode=table'),
      raw: '![[./roles.csv#Sheet1|A1:B2?mode=table]]',
    },
    { markdownFilePath, budget },
  );

  assert.equal(outcome.kind, 'error');
  if (outcome.kind !== 'error') return;
  assert.equal(outcome.code, 'MMI_TABLE_TIME_BUDGET_EXCEEDED');
  assert.match(outcome.message, /cooperative time budget/);
});
