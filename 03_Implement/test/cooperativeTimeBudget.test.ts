import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CooperativeTimeBudgetExceededError,
  createCooperativeTimeBudget,
} from '../src/core/cooperativeTimeBudget.js';

test('cooperative budget checks at its configured work cadence', () => {
  let now = 0;
  const budget = createCooperativeTimeBudget({
    limitMs: 10,
    checkEveryUnits: 2,
    now: () => now,
  });

  now = 20;
  budget.consume();
  assert.throws(
    () => budget.consume(),
    (error: unknown) => {
      assert.ok(error instanceof CooperativeTimeBudgetExceededError);
      assert.equal(error.code, 'MMI_TABLE_TIME_BUDGET_EXCEEDED');
      assert.equal(error.elapsedMs, 20);
      assert.equal(error.limitMs, 10);
      return true;
    },
  );
});

test('cooperative budget check performs an immediate deadline check', () => {
  let now = 5;
  const budget = createCooperativeTimeBudget({ limitMs: 4, now: () => now });
  now = 10;
  assert.throws(() => budget.check(), /cooperative time budget/);
});

test('cooperative budget validates limit and cadence inputs', () => {
  assert.throws(() => createCooperativeTimeBudget({ limitMs: -1 }), /limitMs/);
  assert.throws(() => createCooperativeTimeBudget({ limitMs: Number.NaN }), /limitMs/);
  assert.throws(() => createCooperativeTimeBudget({ limitMs: 10, checkEveryUnits: 0 }), /checkEveryUnits/);
});
