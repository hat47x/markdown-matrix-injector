import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildCandidateReviewInventory,
} from '../src/application/candidateReviewInventory.js';

test('Candidate review inventory exposes generic XML Tree nodes without workbook parsing', () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'mmi-review-xml-tree-'),
  );
  const source = path.join(root, 'service.xml');
  fs.writeFileSync(
    source,
    `<?xml version="1.0" encoding="UTF-8"?>
<catalog version="1">
  <service id="billing">
    <endpoint method="POST">/pay</endpoint>
  </service>
</catalog>`,
  );

  const inventory = buildCandidateReviewInventory(
    source,
    'service.xml',
  );

  assert.deepEqual(inventory.imageDiagnostics, []);
  assert.deepEqual(
    inventory.items.map((item) =>
      item.kind === 'tree'
        ? [item.format, item.pointer, item.nodeType]
        : item.kind),
    [
      ['xml', '/catalog[1]', 'element'],
      ['xml', '/catalog[1]/service[1]', 'element'],
      ['xml', '/catalog[1]/service[1]/endpoint[1]', 'element'],
    ],
  );
  assert.equal(
    inventory.items.every(
      (item) =>
        item.kind === 'tree'
        && item.candidate.kind === 'tree'
        && item.candidate.status === 'observed'
        && item.candidate.execution === 'deterministic'
        && item.candidate.method === 'M0',
    ),
    true,
  );

  const service = inventory.items.find(
    (item) =>
      item.kind === 'tree'
      && item.pointer === '/catalog[1]/service[1]',
  );
  assert.ok(service && service.kind === 'tree');
  assert.equal(service.format, 'xml');
  assert.equal(service.nodeType, 'element');
  assert.equal(service.childCount, 1);
  assert.equal(service.leafCount, 1);
});

test('XML Spreadsheet 2003 remains table inventory rather than XML Tree inventory', () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'mmi-review-xml-spreadsheet-'),
  );
  const source = path.join(root, 'sheet.xml');
  fs.writeFileSync(
    source,
    `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
          xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Sheet1">
    <Table>
      <Row><Cell><Data ss:Type="String">A</Data></Cell></Row>
    </Table>
  </Worksheet>
</Workbook>`,
  );

  const inventory = buildCandidateReviewInventory(
    source,
    'sheet.xml',
  );

  assert.equal(
    inventory.items.some((item) => item.kind === 'tree'),
    false,
  );
  assert.equal(
    inventory.items.some((item) => item.kind === 'table'),
    true,
  );
});
