import test from 'node:test';
import assert from 'node:assert/strict';

import {
  importLedgerJsonSchema,
  importLedgerSchemaJson,
  reviewDecisionsJsonSchema,
  reviewDecisionsSchemaJson,
} from '../src/core/reviewContracts.js';
import { main } from '../src/cli/mmi.js';

async function captureMain(
  argv: string[],
): Promise<{ code: number; output: string; error: string }> {
  const output: string[] = [];
  const errors: string[] = [];
  const write = process.stdout.write.bind(process.stdout);
  const error = console.error;
  process.stdout.write = ((chunk: string) => (
    output.push(String(chunk)),
    true
  )) as typeof process.stdout.write;
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  };
  try {
    return {
      code: await main(argv),
      output: output.join(''),
      error: errors.join('\n'),
    };
  } finally {
    process.stdout.write = write;
    console.error = error;
  }
}

test('ledger schema keeps adoption state separate from Candidate epistemic state', () => {
  assert.equal(
    importLedgerJsonSchema['x-mmi-contract'],
    'mmi.ledger/v1',
  );
  const entry = importLedgerJsonSchema.$defs.entry;
  assert.equal('status' in entry.properties, false);
  assert.equal('reviewState' in entry.properties, true);
  assert.deepEqual(
    entry.properties.reviewState.oneOf[0].enum,
    ['accepted', 'modified'],
  );
  assert.equal(
    entry.properties.reviewState.oneOf[1].const,
    'confirmed',
  );
  assert.equal(
    entry.properties.reviewState.oneOf[1].deprecated,
    true,
  );
});

test('review decision schema persists only negative/deferred review outcomes', () => {
  assert.equal(
    reviewDecisionsJsonSchema['x-mmi-contract'],
    'mmi.review-decisions/v1',
  );
  assert.deepEqual(
    reviewDecisionsJsonSchema.$defs.entry.properties.decision.enum,
    ['rejected', 'deferred'],
  );
  assert.equal(
    'reviewState'
      in reviewDecisionsJsonSchema.$defs.entry.properties,
    false,
  );
});

test('review schema callers receive detached JSON values', () => {
  const ledger = importLedgerSchemaJson();
  (ledger.properties as Record<string, unknown>).schema = {
    const: 'broken',
  };
  assert.equal(
    (
      importLedgerSchemaJson().properties as {
        schema: { const: string };
      }
    ).schema.const,
    'mmi.ledger/v1',
  );

  const decisions = reviewDecisionsSchemaJson();
  (decisions.properties as Record<string, unknown>).schema = {
    const: 'broken',
  };
  assert.equal(
    (
      reviewDecisionsSchemaJson().properties as {
        schema: { const: string };
      }
    ).schema.const,
    'mmi.review-decisions/v1',
  );
});

test('CLI exposes ledger and review decision schemas', async () => {
  const ledger = await captureMain(['schema', 'ledger']);
  assert.equal(ledger.code, 0);
  assert.equal(
    JSON.parse(ledger.output)['x-mmi-contract'],
    'mmi.ledger/v1',
  );

  const decisions = await captureMain([
    'schema',
    'review-decisions',
  ]);
  assert.equal(decisions.code, 0);
  assert.equal(
    JSON.parse(decisions.output)['x-mmi-contract'],
    'mmi.review-decisions/v1',
  );
});

test('CLI schema command rejects unknown contracts', async () => {
  const run = await captureMain(['schema', 'unknown']);
  assert.equal(run.code, 2);
  assert.match(
    run.error,
    /candidate, ledger, review-decisions/u,
  );
});
