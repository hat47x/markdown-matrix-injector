import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  SEMANTIC_CANDIDATE_CONTRACT,
  semanticCandidateJsonSchema,
  semanticCandidateSchemaJson,
} from '../src/core/candidateContract.js';
import {
  main,
  SEMANTIC_CANDIDATE_SCHEMA_NAME,
} from '../src/cli/mmi.js';

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

test('public Candidate schema fixes epistemic, execution, method and review boundaries', () => {
  assert.equal(
    SEMANTIC_CANDIDATE_CONTRACT,
    'mmi.semantic-candidate/v1',
  );
  assert.equal(
    SEMANTIC_CANDIDATE_SCHEMA_NAME,
    SEMANTIC_CANDIDATE_CONTRACT,
  );
  assert.equal(
    semanticCandidateJsonSchema['x-mmi-contract'],
    SEMANTIC_CANDIDATE_CONTRACT,
  );
  assert.deepEqual(
    semanticCandidateJsonSchema.properties.status.enum,
    ['observed', 'inferred', 'abstained'],
  );
  assert.equal(
    semanticCandidateJsonSchema.properties.status.enum.includes(
      'confirmed' as never,
    ),
    false,
  );
  assert.deepEqual(
    semanticCandidateJsonSchema.properties.execution.enum,
    ['deterministic', 'provider-dependent'],
  );
  assert.deepEqual(
    semanticCandidateJsonSchema.properties.method.enum,
    ['M0', 'M1', 'M2', 'M3', 'M4', 'M5'],
  );
  assert.equal(
    'reviewState' in semanticCandidateJsonSchema.properties,
    false,
  );
  assert.equal(
    'confidence' in semanticCandidateJsonSchema.properties,
    false,
  );
  assert.equal(
    semanticCandidateJsonSchema.properties.locator.properties
      .structuralPath.type,
    'string',
  );
});

test('schema callers receive detached JSON and cannot mutate the shared contract', () => {
  const first = semanticCandidateSchemaJson();
  const properties = first.properties as Record<string, unknown>;
  properties.status = { enum: ['confirmed'] };

  const second = semanticCandidateSchemaJson();
  const status = (second.properties as {
    status: { enum: readonly string[] };
  }).status;
  assert.deepEqual(
    status.enum,
    ['observed', 'inferred', 'abstained'],
  );
});

test('CLI exposes Candidate JSON Schema as a stable machine-readable contract', async () => {
  const run = await captureMain(['schema', 'candidate']);
  assert.equal(run.code, 0);
  assert.equal(run.error, '');

  const schema = JSON.parse(run.output);
  assert.equal(
    schema['x-mmi-contract'],
    'mmi.semantic-candidate/v1',
  );
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(
    schema.properties.kind.enum,
    [
      'table-range',
      'image',
      'region-snapshot',
      'shape',
      'diagram',
      'tree',
      'choice-list',
      'note',
      'link',
      'section',
    ],
  );
  assert.equal(
    schema.properties.locator.properties.structuralPath.type,
    'string',
  );
  assert.equal(
    schema.$defs.fingerprint.properties.digest.pattern,
    '^sha256:[0-9a-f]{64}$',
  );
});



test('inspect JSON declares the Candidate contract beside Candidate payloads', async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'mmi-candidate-contract-'),
  );
  const source = path.join(root, 'service.json');
  fs.writeFileSync(
    source,
    JSON.stringify({
      service: { name: 'billing' },
    }),
  );

  const run = await captureMain([
    'inspect',
    source,
    '--root',
    root,
    '--json',
  ]);
  assert.equal(run.code, 0);
  assert.equal(run.error, '');

  const result = JSON.parse(run.output);
  assert.equal(
    result.candidateContract,
    'mmi.semantic-candidate/v1',
  );
  assert.equal(
    result.candidates.every(
      (candidate: unknown) =>
        typeof candidate === 'object'
        && candidate !== null,
    ),
    true,
  );
});
