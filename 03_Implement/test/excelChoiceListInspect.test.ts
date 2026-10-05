import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { inspectSource } from '../src/cli/mmi.js';
import { buildXlsxWithImages } from './helpers/buildXlsxWithImages.js';

test('inspect exposes inline and formula-backed Excel choice-list Candidates', () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'mmi-choice-inspect-'),
  );
  const source = path.join(root, 'form.xlsx');
  fs.writeFileSync(
    source,
    buildXlsxWithImages(
      [{
        name: 'Form',
        cells: [[0, 0, 'Status']],
        extraWorksheetXml: [
          '<dataValidations count="2">',
          '<dataValidation type="list" sqref="A2">',
          '<formula1>&quot;Open,Closed&quot;</formula1>',
          '</dataValidation>',
          '<dataValidation type="list" sqref="B2:B5">',
          '<formula1>Lists!$A$1:$A$3</formula1>',
          '</dataValidation>',
          '</dataValidations>',
        ].join(''),
      }],
      {},
    ),
  );

  const result = inspectSource(source, 0);
  assert.equal(result.choiceLists.length, 2);
  assert.equal(
    result.candidates.filter(
      (candidate) => candidate.kind === 'choice-list',
    ).length,
    2,
  );
  assert.deepEqual(
    result.choiceLists[0].choices,
    ['Open', 'Closed'],
  );
  assert.equal(result.choiceLists[0].range, 'A2');
  assert.equal(result.choiceLists[1].range, 'B2:B5');
  assert.equal(result.choiceLists[1].sourceKind, 'formula');
  assert.equal(result.choiceLists[1].choices, undefined);
  assert.equal(
    result.choiceLists[1].formula1,
    'Lists!$A$1:$A$3',
  );
});
