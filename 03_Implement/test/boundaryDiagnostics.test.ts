import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { checkPaths } from '../src/cli/mmi.js';
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

test('validateEmbedDiagnostics reports only containment for an outside file even when it was read', () => {
  const diags = validateEmbedDiagnostics({
    query: { ...baseQuery, target: 'NoSuchSheet' },
    fileExists: true,
    containmentOk: false,
    sheetExists: false,
    xmlMode: 'invalid',
    availableSheets: ['SecretSheetName'],
  });
  assert.deepEqual(diags.map((entry) => entry.code), ['MMI_PATH_OUTSIDE_BOUNDARY']);
  assert.doesNotMatch(JSON.stringify(diags), /SecretSheetName/u);
});

const SECRET_BOOK = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="SecretSheetName" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
    <Table><Row><Cell><Data ss:Type="String">secret</Data></Cell></Row></Table>
  </Worksheet>
</Workbook>`;

/**
 * A workspace with `linked/` pointing at a directory outside it (#776). A
 * junction needs no elevation on Windows; elsewhere the type is ignored and a
 * directory symlink is made. Returns undefined when links cannot be created.
 */
function linkedOutsideWorkspace(): { base: string; root: string; document: string } | undefined {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-linked-outside-'));
  const root = path.join(base, 'root');
  const outside = path.join(base, 'outside');
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(outside, 'book.xml'), SECRET_BOOK);
  fs.writeFileSync(path.join(outside, 'broken.xml'), 'SecretSheetName is not a workbook');
  try {
    fs.symlinkSync(outside, path.join(root, 'linked'), 'junction');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    fs.rmSync(base, { recursive: true, force: true });
    if (code === 'EPERM' || code === 'EACCES') return undefined;
    throw error;
  }
  const document = path.join(root, 'doc.md');
  fs.writeFileSync(
    document,
    '![[./linked/book.xml#NoSuchSheet|A1:B2]]\n\n![[./linked/broken.xml#Sheet1|A1:B2]]\n',
  );
  return { base, root, document };
}

test('a reference through an in-workspace link to an outside book reports only containment and reads nothing (#776)', async (t) => {
  const workspace = linkedOutsideWorkspace();
  if (!workspace) {
    t.skip('symlink creation is not permitted in this environment');
    return;
  }
  try {
    let reads = 0;
    const items = await createDiagnosticsForDocument(
      fs.readFileSync(workspace.document, 'utf8'),
      workspace.document,
      workspace.root,
      {
        fileExists: async (filepath) => fs.existsSync(filepath) && fs.statSync(filepath).isFile(),
        readFile: async (filepath) => {
          reads += 1;
          return fs.readFileSync(filepath);
        },
        readWorkbookSheetNames: async () => {
          reads += 1;
          return ['SecretSheetName'];
        },
      },
    );
    assert.equal(reads, 0, 'the outside book must not be read');
    assert.deepEqual(
      items.map((item) => item.diagnostic.code),
      ['MMI_PATH_OUTSIDE_BOUNDARY', 'MMI_PATH_OUTSIDE_BOUNDARY'],
    );
    assert.doesNotMatch(JSON.stringify(items), /SecretSheetName/u);
  } finally {
    fs.rmSync(workspace.base, { recursive: true, force: true });
  }
});

test('mmi check reports only containment for a reference through a link to an outside book (#776)', async (t) => {
  const workspace = linkedOutsideWorkspace();
  if (!workspace) {
    t.skip('symlink creation is not permitted in this environment');
    return;
  }
  try {
    const problems = await checkPaths([workspace.document], workspace.root, workspace.root);
    assert.deepEqual(
      problems.map((problem) => problem.code),
      ['MMI_PATH_OUTSIDE_BOUNDARY', 'MMI_PATH_OUTSIDE_BOUNDARY'],
    );
    assert.doesNotMatch(JSON.stringify(problems), /SecretSheetName/u);
  } finally {
    fs.rmSync(workspace.base, { recursive: true, force: true });
  }
});
