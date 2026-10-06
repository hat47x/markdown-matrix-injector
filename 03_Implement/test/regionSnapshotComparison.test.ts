import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readSourceFileIdentity } from '../src/core/sourceIdentity.js';
import {
  RegionSnapshotError,
  type RegionSnapshotResult,
} from '../src/snapshot/libreOfficeRegionSnapshot.js';
import {
  compareRegionSnapshotRenderers,
} from '../src/snapshot/regionSnapshotComparison.js';
import { screenDesignWorkbook } from './helpers/buildXlsxWithImages.js';

function fakeLibreOfficeResult(options: {
  sourcePath: string;
  outDir: string;
  sheet: string;
  range: string;
  sourceLabel?: string;
  sourceDigest?: string;
}): RegionSnapshotResult {
  const digest = options.sourceDigest
    ?? readSourceFileIdentity(options.sourcePath).digest;
  return {
    candidate: {} as RegionSnapshotResult['candidate'],
    manifest: {
      schema: 'mmi.region-snapshot/v1',
      source: {
        label: options.sourceLabel ?? path.basename(options.sourcePath),
        digest,
      },
      selection: { sheet: options.sheet, range: options.range },
      renderer: {
        id: 'mmi.libreoffice-pdf-pdftoppm',
        implementationVersion: '1',
        libreOfficeVersion: 'LibreOffice fixture',
        pdftoppmVersion: 'pdftoppm fixture',
        fontSetDigest: 'sha256:' + 'a'.repeat(64),
        dpi: 150,
      },
      artifact: {
        file: 'snapshot-fixture.png',
        digest: 'sha256:' + 'b'.repeat(64),
        bytes: 100,
        widthPx: 960,
        heightPx: 480,
      },
      renderedAtUtc: '2026-10-06T00:00:00.000Z',
    },
    pngFile: path.join(options.outDir, 'snapshot-fixture.png'),
    manifestFile: path.join(options.outDir, 'snapshot-fixture.mmi-snapshot.json'),
    status: 'written',
    reference: 'snapshot-fixture.png',
    markdown: '![fixture](snapshot-fixture.png)',
  };
}

test('comparison records two renderer observations without a quality score', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-snapshot-compare-'));
  const source = path.join(root, 'design.xlsx');
  fs.writeFileSync(source, screenDesignWorkbook().bytes);

  const report = await compareRegionSnapshotRenderers(
    {
      sourcePath: source,
      sourceLabel: './design.xlsx',
      sheet: '画面一覧',
      range: 'A1:G6',
      outDir: path.join(root, 'comparison'),
    },
    {
      libreOffice: async (options) =>
        fakeLibreOfficeResult({
          sourcePath: options.sourcePath,
          outDir: options.outDir,
          sheet: options.sheet,
          range: options.range,
          sourceLabel: options.sourceLabel,
        }),
    },
  );

  assert.equal(report.schema, 'mmi.region-snapshot-comparison/v1');
  assert.equal(report.native.status, 'rendered');
  assert.equal(report.native.mediaType, 'image/svg+xml');
  assert.equal(report.libreOffice.status, 'rendered');
  if (report.libreOffice.status !== 'rendered') return;
  assert.equal(report.libreOffice.mediaType, 'image/png');
  assert.equal(report.observations.bothRendered, true);
  assert.equal(typeof report.observations.aspectRatioDifference, 'number');
  assert.deepEqual(report.interpretationBoundary, {
    noQualityScore: true,
    noPassFailThreshold: true,
    noRendererEquivalenceClaim: true,
  });
  assert.equal('score' in report, false);
  assert.equal('passed' in report, false);
});

test('comparison keeps native evidence when LibreOffice runtime is unavailable', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-snapshot-compare-'));
  const source = path.join(root, 'design.xlsx');
  fs.writeFileSync(source, screenDesignWorkbook().bytes);

  const report = await compareRegionSnapshotRenderers(
    {
      sourcePath: source,
      sheet: '画面一覧',
      range: 'A1:G6',
      outDir: path.join(root, 'comparison'),
    },
    {
      libreOffice: async () => {
        throw new RegionSnapshotError(
          'MMI_SNAPSHOT_LIBREOFFICE_UNAVAILABLE',
          'fixture unavailable',
        );
      },
    },
  );

  assert.equal(report.native.status, 'rendered');
  assert.deepEqual(report.libreOffice, {
    status: 'unavailable',
    diagnosticCode: 'MMI_SNAPSHOT_LIBREOFFICE_UNAVAILABLE',
  });
  assert.deepEqual(report.observations, { bothRendered: false });
});

test('comparison rejects results that do not belong to the same source selection', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-snapshot-compare-'));
  const source = path.join(root, 'design.xlsx');
  fs.writeFileSync(source, screenDesignWorkbook().bytes);

  await assert.rejects(
    compareRegionSnapshotRenderers(
      {
        sourcePath: source,
        sourceLabel: './design.xlsx',
        sheet: '画面一覧',
        range: 'A1:G6',
        outDir: path.join(root, 'comparison'),
      },
      {
        libreOffice: async (options) =>
          fakeLibreOfficeResult({
            sourcePath: options.sourcePath,
            outDir: options.outDir,
            sheet: options.sheet,
            range: options.range,
            sourceLabel: options.sourceLabel,
            sourceDigest: 'sha256:' + 'f'.repeat(64),
          }),
      },
    ),
    /did not evaluate the same source selection/u,
  );
});
