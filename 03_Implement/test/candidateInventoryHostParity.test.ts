import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildCandidateReviewInventory,
} from '../src/application/candidateReviewInventory.js';
import {
  collectStandaloneTreeCandidates,
} from '../src/application/sourceCandidateInventory.js';
import {
  collectWorkbookCandidates,
} from '../src/application/workbookCandidateInventory.js';
import {
  DEFAULT_FLAT_TEXT_TREE_METHODS,
} from '../src/adapters/flatTextTreeStructuralizer.js';
import type {
  TabularHierarchyConfig,
} from '../src/adapters/tabularHierarchyAdapter.js';
import type { Candidate } from '../src/core/candidate.js';
import { inspectSource } from '../src/cli/mmi.js';
import {
  buildXlsxWithImages,
  screenDesignWorkbook,
} from './helpers/buildXlsxWithImages.js';

function imageCandidates(items: readonly Candidate[]): Candidate[] {
  return items.filter((candidate) => candidate.kind === 'image');
}

test('CLI inspect and VS Code review inventory produce identical image Candidates', () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'mmi-inventory-parity-'),
  );
  const source = path.join(root, 'design.xlsx');
  const document = path.join(root, 'spec.md');
  fs.writeFileSync(source, screenDesignWorkbook().bytes);
  fs.writeFileSync(document, '# Spec\n');

  const cli = inspectSource(source, 0, document);
  const review = buildCandidateReviewInventory(
    source,
    './design.xlsx',
  );

  const reviewCandidates = review.items.map((item) => item.candidate);
  const application = collectWorkbookCandidates(
    source,
    './design.xlsx',
  );

  assert.deepEqual(cli.candidates, application.candidates);
  assert.deepEqual(reviewCandidates, application.candidates);
  assert.deepEqual(
    cli.sheets.map((sheet) => ({
      name: sheet.name,
      ranges: sheet.regions.map((region) => region.a1),
    })),
    application.detected.map((sheet) => ({
      name: sheet.name,
      ranges: sheet.regions.map((region) => region.a1),
    })),
  );

  const cliImages = imageCandidates(cli.candidates);
  const reviewImages = review.items
    .filter((item) => item.kind === 'image')
    .map((item) => item.candidate);
  assert.deepEqual(reviewImages, cliImages);

  const login = reviewImages.find(
    (candidate) =>
      candidate.locator.sheet === '画面一覧'
      && candidate.locator.range === 'D1:F4',
  );
  assert.ok(login);
  assert.equal(
    login.claims.some(
      (claim) =>
        claim.aspect === 'nearby-table'
        && claim.value === 'A1:B3'
        && claim.status === 'inferred'
        && claim.method === 'M1',
    ),
    true,
  );
});


function assertHostCandidateParity(
  source: string,
  sourceLabel: string,
  document: string,
): void {
  const cli = inspectSource(source, 0, document);
  const review = buildCandidateReviewInventory(source, sourceLabel);
  const standalone = collectStandaloneTreeCandidates(
    source,
    sourceLabel,
  );
  const applicationCandidates = standalone
    ? standalone.candidates
    : collectWorkbookCandidates(source, sourceLabel).candidates;

  assert.deepEqual(cli.candidates, applicationCandidates);
  assert.deepEqual(
    review.items.map((item) => item.candidate),
    standalone
      ? applicationCandidates.filter(
          (candidate) => candidate.status !== 'abstained',
        )
      : applicationCandidates,
  );
}

test('CLI inspect and VS Code review inventory keep JSON/YAML/XML Tree Candidates identical', () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'mmi-tree-parity-'),
  );
  const document = path.join(root, 'spec.md');
  fs.writeFileSync(document, '# Spec\n');

  const fixtures: Array<{
    name: string;
    text: string;
  }> = [
    {
      name: 'service.json',
      text: JSON.stringify({
        service: {
          name: 'billing',
          endpoints: [{ path: '/pay', method: 'POST' }],
        },
        enabled: true,
      }, null, 2),
    },
    {
      name: 'service.yaml',
      text: [
        'service:',
        '  name: billing',
        '  endpoints:',
        '    - path: /pay',
        '      method: POST',
        'enabled: true',
        '',
      ].join('\n'),
    },
    {
      name: 'service.xml',
      text: [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<service enabled="true">',
        '  <name>billing</name>',
        '  <endpoint method="POST">/pay</endpoint>',
        '</service>',
      ].join('\n'),
    },
  ];

  for (const fixture of fixtures) {
    const source = path.join(root, fixture.name);
    fs.writeFileSync(source, fixture.text);
    assertHostCandidateParity(
      source,
      `./${fixture.name}`,
      document,
    );
  }
});

test('CLI inspect and VS Code review inventory keep inferred flat-text Tree Candidates identical', () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'mmi-text-tree-parity-'),
  );
  const source = path.join(root, 'outline.txt');
  const document = path.join(root, 'spec.md');
  fs.writeFileSync(document, '# Spec\n');
  fs.writeFileSync(
    source,
    [
      '1. Overview',
      '1.1 Scope',
      '1.2 Data',
      '2. Operations',
      '2.1 Deploy',
    ].join('\n'),
  );

  assertHostCandidateParity(source, './outline.txt', document);
});

test('CLI inspect and VS Code review inventory keep Shape and connector Candidates identical', () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'mmi-shape-parity-'),
  );
  const source = path.join(root, 'flow.xlsx');
  const document = path.join(root, 'spec.md');
  fs.writeFileSync(document, '# Spec\n');

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
      [{
        name: '業務フロー',
        cells: [[0, 0, '工程']],
        rawDrawing: drawing,
      }],
      {},
    ),
  );

  assertHostCandidateParity(source, './flow.xlsx', document);
});

test('CLI inspect and VS Code review inventory keep Choice List Candidates identical', () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'mmi-choice-parity-'),
  );
  const source = path.join(root, 'form.xlsx');
  const document = path.join(root, 'spec.md');
  fs.writeFileSync(document, '# Spec\n');

  fs.writeFileSync(
    source,
    buildXlsxWithImages(
      [
        {
          name: '申請',
          cells: [[0, 0, '担当']],
          extraWorksheetXml: [
            '<dataValidations count="1">',
            '<dataValidation type="list" sqref="A2:A20">',
            '<formula1>担当者!$A$2:$A$4</formula1>',
            '</dataValidation>',
            '</dataValidations>',
          ].join(''),
        },
        {
          name: '担当者',
          cells: [
            [0, 0, '氏名'],
            [1, 0, '佐藤'],
            [2, 0, '鈴木'],
            [3, 0, '田中'],
          ],
        },
      ],
      {},
    ),
  );

  assertHostCandidateParity(source, './form.xlsx', document);
});


test('CLI, review host and Application snapshot share explicit tabular hierarchy Candidates', () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'mmi-tabular-hierarchy-parity-'),
  );
  const source = path.join(root, 'hierarchy.csv');
  const document = path.join(root, 'spec.md');
  fs.writeFileSync(document, '# Spec\n');
  fs.writeFileSync(
    source,
    [
      'ID,Parent,Name',
      'A,,Account',
      'A-1,A,Create',
      'B,,Operations',
    ].join('\n'),
  );

  const config: TabularHierarchyConfig = {
    mode: 'parent-id',
    idHeader: 'ID',
    parentHeader: 'Parent',
    labelHeader: 'Name',
  };
  const cli = inspectSource(
    source,
    0,
    document,
    DEFAULT_FLAT_TEXT_TREE_METHODS,
    config,
  );
  const review = buildCandidateReviewInventory(
    source,
    './hierarchy.csv',
    {
      tabularHierarchy: {
        sheet: 'Sheet1',
        config,
      },
    },
  );
  const application = collectWorkbookCandidates(
    source,
    './hierarchy.csv',
    { tabularHierarchy: config },
  );

  assert.deepEqual(cli.candidates, application.candidates);
  assert.deepEqual(
    review.items.map((item) => item.candidate),
    application.candidates,
  );
  assert.equal(
    application.hierarchies[0]?.result.candidates.some(
      (candidate) =>
        candidate.locator.structuralPath
        === 'table-hierarchy:parent-id:id:A-1',
    ),
    true,
  );
});
