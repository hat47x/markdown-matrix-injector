import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MMI_KNOWN_PARAMETER_CONTRACT,
  validateKnownEmbedQueryParameters,
  type KnownEmbedQueryParameter,
} from '../src/parser/parameterContract.js';

test('validates the complete known Notation v1 parameter vocabulary', () => {
  const params = new URLSearchParams([
    ['mode', 'table'],
    ['header', 'first'],
    ['columns', 'A, C,AA'],
    ['transpose', 'true'],
    ['grep', 'AUTH'],
    ['highlightColumn', 'State'],
    ['highlightValue', 'ready'],
    ['formatColumn', 'E:json'],
    ['formatColumn', 'Payload:yaml'],
    ['caption', 'Release status'],
    ['id', 'release-status'],
    ['pageBreak', 'both'],
    ['orientation', 'landscape'],
  ]);

  assert.deepEqual(validateKnownEmbedQueryParameters(params), []);
});

test('reports each constrained known parameter violation', () => {
  const params = new URLSearchParams([
    ['mode', 'rocket'],
    ['header', '-1'],
    ['columns', 'A,2'],
    ['transpose', 'false'],
    ['grep', ''],
    ['formatColumn', 'Payload'],
    ['pageBreak', 'middle'],
    ['orientation', 'square'],
  ]);

  const issues = validateKnownEmbedQueryParameters(params);

  assert.deepEqual(
    issues.map((issue) => [issue.key, issue.constraint]),
    [
      ['mode', 'enum'],
      ['header', 'pattern'],
      ['columns', 'pattern'],
      ['transpose', 'enum'],
      ['grep', 'minLength'],
      ['formatColumn', 'pattern'],
      ['pageBreak', 'enum'],
      ['orientation', 'enum'],
    ],
  );
});

test('keeps unknown and x-* parameters forward-compatible', () => {
  const params = new URLSearchParams([
    ['futureFlag', '1'],
    ['x-lab', 'anything'],
  ]);

  assert.deepEqual(validateKnownEmbedQueryParameters(params), []);
});

test('validates every repeated formatColumn occurrence', () => {
  const params = new URLSearchParams([
    ['formatColumn', 'A:json'],
    ['formatColumn', 'invalid'],
    ['formatColumn', 'C:yaml'],
  ]);

  assert.deepEqual(
    validateKnownEmbedQueryParameters(params).map((issue) => ({
      key: issue.key,
      occurrence: issue.occurrence,
      constraint: issue.constraint,
    })),
    [{
      key: 'formatColumn',
      occurrence: 1,
      constraint: 'pattern',
    }],
  );
});

test('TypeScript parameter contract stays synchronized with params.schema.json', () => {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const schemaPath = path.resolve(
    testDir,
    '../../04_Documentation/spec/params.schema.json',
  );
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as {
    properties: Record<string, {
      enum?: string[];
      pattern?: string;
      minLength?: number;
    }>;
    patternProperties?: Record<string, unknown>;
    additionalProperties?: boolean;
  };

  const contractKeys = Object.keys(
    MMI_KNOWN_PARAMETER_CONTRACT,
  ).sort() as KnownEmbedQueryParameter[];
  assert.deepEqual(contractKeys, Object.keys(schema.properties).sort());
  assert.equal(schema.additionalProperties, true);
  assert.ok(schema.patternProperties?.['^x-']);

  for (const key of contractKeys) {
    const contract = MMI_KNOWN_PARAMETER_CONTRACT[key].constraint;
    const property = schema.properties[key];
    assert.ok(property, `schema is missing ${key}`);

    switch (contract.kind) {
      case 'string':
        assert.equal(property.enum, undefined);
        assert.equal(property.pattern, undefined);
        assert.equal(property.minLength, undefined);
        break;
      case 'enum':
        assert.deepEqual(property.enum, [...contract.values]);
        break;
      case 'pattern':
        assert.equal(property.pattern, contract.source);
        break;
      case 'minLength':
        assert.equal(property.minLength, contract.value);
        break;
    }
  }
});
