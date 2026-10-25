import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { validateEmbedDiagnostics } from '../src/dx/diagnostics.js';
import { createDiagnosticsForDocument } from '../src/dx/vscodeAdapters.js';

const baseQuery = {
  raw: '![[fixtures/sample.xml#Sheet1|A1:B2]]',
  filepath: 'fixtures/sample.xml',
  target: 'Sheet1',
};

test('validateEmbedDiagnostics reports containment, not missing file, when the reference is outside the boundary', () => {
  const diags = validateEmbedDiagnostics({
    query: baseQuery,
    fileExists: false,
    containmentOk: false,
  });
  assert.deepEqual(diags.map((entry) => entry.code), ['MMI_PATH_OUTSIDE_BOUNDARY']);
  assert.match(diags[0].message, /outside workspace boundary/u);
});

test('createDiagnosticsForDocument decides containment without probing the outside path', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-boundary-diagnostics-'));
  try {
    let probes = 0;
    const items = await createDiagnosticsForDocument(
      '![[../../absent-outside.csv#Sheet1|A1:B2]]\n',
      path.join(root, 'workspace', 'docs', 'spec.md'),
      path.join(root, 'workspace'),
      {
        fileExists: async () => {
          probes += 1;
          return false;
        },
        readFile: async () => Buffer.from(''),
        readWorkbookSheetNames: async () => [],
      },
    );
    assert.equal(probes, 0, 'the outside path must not be probed');
    assert.deepEqual(
      items.map((item) => item.diagnostic.code),
      ['MMI_PATH_OUTSIDE_BOUNDARY'],
    );
    assert.match(items[0].diagnostic.message, /outside workspace boundary/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
