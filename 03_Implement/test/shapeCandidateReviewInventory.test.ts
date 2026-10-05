import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildCandidateReviewInventory,
} from '../src/application/candidateReviewInventory.js';
import { buildXlsxWithImages } from './helpers/buildXlsxWithImages.js';

test('Candidate review inventory exposes AutoShape and connector source objects', () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'mmi-shape-review-'),
  );
  const source = path.join(root, 'flow.xlsx');
  const drawing = [
    '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">',
    '<xdr:twoCellAnchor>',
    '<xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>',
    '<xdr:to><xdr:col>2</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>2</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>',
    '<xdr:sp><xdr:nvSpPr><xdr:cNvPr id="2" name="開始"/></xdr:nvSpPr><xdr:spPr><a:prstGeom prst="ellipse"/></xdr:spPr><xdr:txBody><a:p><a:r><a:t>開始</a:t></a:r></a:p></xdr:txBody></xdr:sp>',
    '<xdr:cxnSp><xdr:nvCxnSpPr><xdr:cNvPr id="3" name="矢印"/></xdr:nvCxnSpPr></xdr:cxnSp>',
    '<xdr:clientData/>',
    '</xdr:twoCellAnchor>',
    '</xdr:wsDr>',
  ].join('');
  fs.writeFileSync(
    source,
    buildXlsxWithImages(
      [{ name: '業務フロー', cells: [[0, 0, '工程']], rawDrawing: drawing }],
      {},
    ),
  );

  const inventory = buildCandidateReviewInventory(
    source,
    './flow.xlsx',
  );
  const shapes = inventory.items.filter(
    (item) => item.kind === 'shape',
  );
  assert.equal(shapes.length, 2);
  assert.deepEqual(
    shapes.map((item) => item.kind === 'shape'
      ? {
          objectKind: item.shape.objectKind,
          name: item.shape.name,
          range: item.shape.range,
          status: item.candidate.status,
          method: item.candidate.method,
        }
      : undefined),
    [
      {
        objectKind: 'shape',
        name: '開始',
        range: 'A1:B2',
        status: 'observed',
        method: 'M0',
      },
      {
        objectKind: 'connector',
        name: '矢印',
        range: 'A1:B2',
        status: 'observed',
        method: 'M0',
      },
    ],
  );
});
