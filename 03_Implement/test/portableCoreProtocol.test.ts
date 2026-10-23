import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { tableCandidates } from '../src/adapters/tableRegionAdapter.js';
import { readXmlTree } from '../src/adapters/xmlTreeAdapter.js';
import {
  PORTABLE_CORE_REQUEST_SCHEMA,
  PORTABLE_CORE_RESPONSE_SCHEMA,
  runPortableCoreRequest,
} from '../src/application/portableCoreProtocol.js';
import { main } from '../src/cli/mmi.js';
import { loadWorkbookFromBytes } from '../src/core/workbookLoader.js';
import { decodeGenericXmlUtf8 } from '../src/core/xmlFormat.js';
import { buildXlsxWithImages } from './helpers/buildXlsxWithImages.js';

interface ConformanceCandidateExpectation {
  kind: string;
  sheet?: string;
  range?: string;
  structuralPath?: string;
  status?: string;
  claims?: unknown[];
  execution: string;
  method: string;
  provenanceAlgorithm: string;
  provenanceVersion?: string;
  fingerprintRepresentation: string;
  fingerprintDigest?: string;
}

interface ConformanceCase {
  schema: 'mmi.portable-core-conformance/v1';
  request: unknown;
  expected: {
    source: {
      format: string;
      digest: string;
      byteLength: number;
    };
    candidateCount: number;
    candidates: ConformanceCandidateExpectation[];
  };
}

const fixtureDirectory = fileURLToPath(
  new URL('./fixtures/portable-core-v1/', import.meta.url),
);

function readCase(name: string): ConformanceCase {
  return JSON.parse(
    fs.readFileSync(path.join(fixtureDirectory, name), 'utf8'),
  ) as ConformanceCase;
}

function assertConformanceCase(fixture: ConformanceCase): void {
  assert.equal(fixture.schema, 'mmi.portable-core-conformance/v1');
  const response = runPortableCoreRequest(fixture.request);
  assert.equal(response.schema, PORTABLE_CORE_RESPONSE_SCHEMA);
  assert.equal(response.operation, 'inspect');
  assert.equal(response.execution, 'deterministic');
  assert.equal(response.source.format, fixture.expected.source.format);
  assert.equal(response.source.digest, fixture.expected.source.digest);
  assert.equal(response.source.byteLength, fixture.expected.source.byteLength);
  assert.equal(response.candidates.length, fixture.expected.candidateCount);
  assert.equal(response.diagnostics.length, 0);

  fixture.expected.candidates.forEach((expected, index) => {
    const candidate = response.candidates[index];
    assert.ok(candidate, `candidate ${index} is missing`);
    assert.equal(candidate.kind, expected.kind);
    if (expected.status !== undefined) {
      assert.equal(candidate.status, expected.status);
    }
    if (expected.claims !== undefined) {
      assert.deepEqual(candidate.claims, expected.claims);
    }
    assert.equal(candidate.execution, expected.execution);
    assert.equal(candidate.method, expected.method);
    assert.equal(
      candidate.provenance.algorithm,
      expected.provenanceAlgorithm,
    );
    if (expected.provenanceVersion !== undefined) {
      const run = candidate.provenance.run;
      assert.ok(run.execution === 'deterministic');
      assert.equal(
        run.implementationVersion,
        expected.provenanceVersion,
      );
    }
    assert.equal(
      candidate.fingerprint.representation,
      expected.fingerprintRepresentation,
    );
    if (expected.fingerprintDigest !== undefined) {
      assert.equal(
        candidate.fingerprint.digest,
        expected.fingerprintDigest,
      );
    }
    if (expected.sheet !== undefined) {
      assert.equal(candidate.locator.sheet, expected.sheet);
    }
    if (expected.range !== undefined) {
      assert.equal(candidate.locator.range, expected.range);
    }
    if (expected.structuralPath !== undefined) {
      assert.equal(candidate.locator.structuralPath, expected.structuralPath);
    }
    assert.equal(candidate.locator.sourceDigest, response.source.digest);
    assert.equal(
      candidate.provenance.run.inputDigest,
      response.source.digest,
    );
  });
}

test('portable Core CSV conformance case', () => {
  assertConformanceCase(readCase('csv-table.case.json'));
});

test('portable Core XLSX conformance case', () => {
  assertConformanceCase(readCase('xlsx-table.case.json'));
});

test('portable Core XLSX preserves leading blank row coordinates', () => {
  assertConformanceCase(readCase('xlsx-leading-blank-rows.case.json'));
});

test('portable Core CSV preserves leading blank row coordinates', () => {
  assertConformanceCase(readCase('csv-leading-blank-rows.case.json'));
});

test('portable Core JSON Tree conformance case', () => {
  assertConformanceCase(readCase('json-tree.case.json'));
});

test('portable Core JSON Tree preserves JavaScript UTF-16 key order and JSON Pointer escaping', () => {
  assertConformanceCase(readCase('json-tree-unicode.case.json'));
});

test('portable Core generic XML Tree conformance case', () => {
  assertConformanceCase(readCase('xml-tree.case.json'));
});

test('portable Core namespaced XML preserves qualified names, sibling ordinals and namespace attributes', () => {
  assertConformanceCase(readCase('xml-tree-namespace.case.json'));
});

test('portable Core generic XML Candidates are identical to the existing adapter path', () => {
  const fixture = readCase('xml-tree.case.json');
  const request = fixture.request as {
    source: {
      name: string;
      label: string;
      bytesBase64: string;
    };
  };
  const bytes = Buffer.from(request.source.bytesBase64, 'base64');
  const response = runPortableCoreRequest(fixture.request);
  const direct = readXmlTree(
    decodeGenericXmlUtf8(bytes),
    request.source.label,
    response.source.digest,
  );

  assert.deepEqual(response.candidates, direct.candidates);
  assert.equal(response.source.format, 'xml');
});

test('portable Core XML Spreadsheet 2003 remains on the table adapter route', () => {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const sourcePath = path.resolve(
    testDir,
    '../../04_Documentation/samples/practical/data/migration.xml',
  );
  const bytes = fs.readFileSync(sourcePath);
  const response = runPortableCoreRequest({
    schema: PORTABLE_CORE_REQUEST_SCHEMA,
    operation: 'inspect',
    source: {
      name: 'migration.xml',
      label: './migration.xml',
      bytesBase64: bytes.toString('base64'),
    },
  });

  assert.equal(response.source.format, 'xml-spreadsheet');
  assert.ok(response.candidates.length > 0);
  assert.equal(
    response.candidates.some((candidate) => candidate.kind === 'tree'),
    false,
  );
});

test('portable Core XLSX table Candidates are identical to the existing adapter path', () => {
  const bytes = buildXlsxWithImages([
    {
      name: 'Data',
      cells: [
        [0, 0, 'ID'],
        [0, 1, 'Name'],
        [1, 0, '1'],
        [1, 1, 'Alpha'],
        [2, 0, '2'],
        [2, 1, 'Beta'],
      ],
    },
  ], {});

  const response = runPortableCoreRequest({
    schema: PORTABLE_CORE_REQUEST_SCHEMA,
    operation: 'inspect',
    source: {
      name: 'fixture.xlsx',
      label: './fixture.xlsx',
      bytesBase64: bytes.toString('base64'),
    },
    executionPolicy: {
      allowProviderDependent: false,
    },
  });

  const workbook = loadWorkbookFromBytes('fixture.xlsx', bytes);
  const direct = Object.entries(workbook.sheets).flatMap(
    ([sheetName, sheet]) => tableCandidates({
      source: './fixture.xlsx',
      sourceDigest: response.source.digest,
      sheetName,
      sheet,
    }),
  );

  assert.deepEqual(response.candidates, direct);
  assert.equal(response.source.format, 'xlsx');
});

test('portable Core source bytes are self-contained and never resolved from source.name', () => {
  const bytes = Buffer.from('ID,Name\n1,Alpha\n', 'utf8');
  const response = runPortableCoreRequest({
    schema: PORTABLE_CORE_REQUEST_SCHEMA,
    operation: 'inspect',
    source: {
      name: '../../definitely-not-a-real-file.csv',
      label: './logical.csv',
      bytesBase64: bytes.toString('base64'),
    },
  });
  assert.equal(response.source.label, './logical.csv');
  assert.equal(response.candidates.length, 1);
  assert.equal(response.candidates[0].locator.source, './logical.csv');
});

test('portable Core v1 rejects provider-dependent execution and schema expansion', () => {
  assert.throws(
    () => runPortableCoreRequest({
      schema: PORTABLE_CORE_REQUEST_SCHEMA,
      operation: 'inspect',
      source: {
        name: 'fixture.csv',
        label: './fixture.csv',
        bytesBase64: '',
      },
      executionPolicy: {
        allowProviderDependent: true,
      },
    }),
    /does not allow provider-dependent execution/u,
  );

  assert.throws(
    () => runPortableCoreRequest({
      schema: PORTABLE_CORE_REQUEST_SCHEMA,
      operation: 'inspect',
      source: {
        name: 'fixture.csv',
        label: './fixture.csv',
        bytesBase64: '',
      },
      command: 'write-source',
    }),
    /unsupported field/u,
  );
});

test('portable Core generic XML rejects invalid UTF-8 and DTD-dependent input', () => {
  assert.throws(
    () => runPortableCoreRequest({
      schema: PORTABLE_CORE_REQUEST_SCHEMA,
      operation: 'inspect',
      source: {
        name: 'invalid.xml',
        label: './invalid.xml',
        bytesBase64: Buffer.from([0x3c, 0x61, 0x3e, 0xff, 0x3c, 0x2f, 0x61, 0x3e]).toString('base64'),
      },
    }),
    /valid UTF-8/u,
  );

  assert.throws(
    () => runPortableCoreRequest({
      schema: PORTABLE_CORE_REQUEST_SCHEMA,
      operation: 'inspect',
      source: {
        name: 'doctype.xml',
        label: './doctype.xml',
        bytesBase64: Buffer.from(
          '<!DOCTYPE service [<!ENTITY x "value">]><service>&x;</service>',
          'utf8',
        ).toString('base64'),
      },
    }),
    /DTD\/declaration syntax is not supported/u,
  );
});

test('portable Core accepts a zero-byte CSV but rejects non-canonical base64', () => {
  const empty = runPortableCoreRequest({
    schema: PORTABLE_CORE_REQUEST_SCHEMA,
    operation: 'inspect',
    source: {
      name: 'empty.csv',
      label: './empty.csv',
      bytesBase64: '',
    },
  });
  assert.equal(empty.source.byteLength, 0);
  assert.equal(empty.candidates.length, 0);

  assert.throws(
    () => runPortableCoreRequest({
      schema: PORTABLE_CORE_REQUEST_SCHEMA,
      operation: 'inspect',
      source: {
        name: 'fixture.csv',
        label: './fixture.csv',
        bytesBase64: 'not base64',
      },
    }),
    /canonical base64/u,
  );
});

test('portable Core contract has no Node or VS Code runtime imports', () => {
  const contractSource = fs.readFileSync(
    fileURLToPath(
      new URL('../src/application/portableCoreContract.ts', import.meta.url),
    ),
    'utf8',
  );
  assert.doesNotMatch(contractSource, /from ['"]node:/u);
  assert.doesNotMatch(contractSource, /from ['"]vscode['"]/u);
  assert.match(contractSource, /import type \{ Candidate \}/u);
});

async function captureMain(argv: string[]): Promise<{
  code: number;
  output: string;
}> {
  const written: string[] = [];
  const out = process.stdout.write.bind(process.stdout);
  const err = console.error;
  process.stdout.write = ((
    chunk: string,
  ) => (written.push(String(chunk)), true)) as typeof process.stdout.write;
  console.error = () => undefined;
  try {
    return {
      code: await main(argv),
      output: written.join(''),
    };
  } finally {
    process.stdout.write = out;
    console.error = err;
  }
}

test('mmi core executes the same portable request contract from a JSON file', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-portable-core-'));
  const requestPath = path.join(root, 'request.json');
  const fixture = readCase('csv-table.case.json');
  fs.writeFileSync(requestPath, JSON.stringify(fixture.request));

  const result = await captureMain(['core', requestPath]);
  assert.equal(result.code, 0);
  const response = JSON.parse(result.output);
  assert.equal(response.schema, PORTABLE_CORE_RESPONSE_SCHEMA);
  assert.equal(response.source.digest, fixture.expected.source.digest);
  assert.equal(response.candidates.length, fixture.expected.candidateCount);
});

test('mmi core rejects malformed request JSON before invoking Core', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-portable-core-'));
  const requestPath = path.join(root, 'request.json');
  fs.writeFileSync(requestPath, '{');

  const result = await captureMain(['core', requestPath]);
  assert.equal(result.code, 2);
  assert.equal(result.output, '');
});


test('portable Core v1 keeps YAML outside the frozen conformance scope', () => {
  assert.throws(
    () => runPortableCoreRequest({
      schema: PORTABLE_CORE_REQUEST_SCHEMA,
      operation: 'inspect',
      source: {
        name: 'service.yaml',
        label: './service.yaml',
        bytesBase64: Buffer.from(
          'service:\n  name: billing\n',
          'utf8',
        ).toString('base64'),
      },
    }),
    /unsupported portable core source format: \.yaml/u,
  );
});
