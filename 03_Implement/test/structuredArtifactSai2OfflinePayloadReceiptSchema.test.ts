import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const SCHEMA =
  'structured-artifact-sai2-offline-payload-receipt-schema-v0.json';
const HANDOFF =
  'structured-artifact-sai2-real-source-primary-materialization-ordinal-1-offline-handoff-request-v0.json';

function json(name: string): any {
  return JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8'));
}

test('offline payload receipt schema matches hardened handoff required fields', () => {
  const schema = json(SCHEMA);
  const handoff = json(HANDOFF);
  const receipt = handoff.required_outputs.receipt;

  assert.equal(
    schema.properties.schema.const,
    receipt.schema,
  );
  assert.deepEqual(schema.required, receipt.required_fields);
  assert.equal(schema.additionalProperties, false);
  assert.equal(
    schema.properties.workbook_semantic_inspection_performed.const,
    false,
  );
  assert.equal(schema.properties.http_status.minimum, 200);
  assert.equal(schema.properties.http_status.maximum, 299);
  assert.equal(schema.properties.redirect_chain.maxItems, 10);
});

test('receipt schema pins payload identity fields needed by receiving runners', () => {
  const schema = json(SCHEMA);

  assert.match(
    schema.properties.sha256.pattern,
    /sha256/u,
  );
  assert.equal(schema.properties.byte_size.minimum, 1);
  assert.match(
    schema.properties.content_type.pattern,
    /spreadsheetml/u,
  );
  assert.match(
    schema.properties.retrieved_at_utc.pattern,
    /Z/u,
  );
  for (const field of [
    'source_id',
    'request_url',
    'byte_size',
    'sha256',
    'workbook_semantic_inspection_performed',
  ]) {
    assert.ok(schema.required.includes(field));
  }
});

test('receipt schema remains transport-only', () => {
  const schemaText = readFileSync(new URL(SCHEMA, FIXTURES), 'utf8');

  assert.doesNotMatch(schemaText, /worksheet_name/u);
  assert.doesNotMatch(schemaText, /target_range/u);
  assert.doesNotMatch(schemaText, /candidate/u);
  assert.doesNotMatch(schemaText, /ranker/u);
});
