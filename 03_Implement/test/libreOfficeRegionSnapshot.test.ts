import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readLedger } from '../src/core/importLedger.js';
import {
  probeSnapshotRuntime,
  RegionSnapshotError,
  renderLibreOfficeRegionSnapshot,
} from '../src/snapshot/libreOfficeRegionSnapshot.js';
import {
  buildXlsxWithImages,
  pngOf,
} from './helpers/buildXlsxWithImages.js';

const sha256 = (bytes: Buffer): string =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

test('snapshot rejects invalid sources and ranges before invoking LibreOffice', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-snapshot-invalid-'));
  const source = path.join(root, 'source.csv');
  fs.writeFileSync(source, 'a,b\n1,2\n');

  await assert.rejects(
    renderLibreOfficeRegionSnapshot({
      sourcePath: source,
      sheet: 'Sheet1',
      range: 'A1:B2',
      outDir: path.join(root, 'assets'),
    }),
    (error: unknown) =>
      error instanceof RegionSnapshotError
      && error.code === 'MMI_SNAPSHOT_UNSUPPORTED_SOURCE',
  );

  const xlsx = path.join(root, 'source.xlsx');
  fs.writeFileSync(xlsx, buildXlsxWithImages([{ name: 'Sheet1', cells: [[0, 0, 'x']] }], {}));
  await assert.rejects(
    renderLibreOfficeRegionSnapshot({
      sourcePath: xlsx,
      sheet: 'Sheet1',
      range: 'not-a-range',
      outDir: path.join(root, 'assets'),
    }),
    (error: unknown) =>
      error instanceof RegionSnapshotError
      && error.code === 'MMI_SNAPSHOT_RANGE_INVALID',
  );
});

test('LibreOffice region snapshot is byte-stable and ledger-backed when runtime is available', async (t) => {
  try {
    await probeSnapshotRuntime();
  } catch (error) {
    t.skip(`LibreOffice snapshot runtime unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-snapshot-runtime-'));
  const source = path.join(root, 'design.xlsx');
  const outDir = path.join(root, 'assets', 'snapshots');
  const ledgerPath = path.join(root, 'mmi-ledger.json');
  const picture = pngOf(8, 6, [30, 90, 200]);
  fs.writeFileSync(
    source,
    buildXlsxWithImages(
      [
        {
          name: '設計',
          cells: [
            [0, 0, '画面ID'],
            [0, 1, '画面名'],
            [1, 0, 'S01'],
            [1, 1, 'ログイン'],
            [9, 0, '範囲外'],
          ],
          anchors: [{
            kind: 'two',
            from: [3, 0],
            to: [5, 4],
            media: 'screen.png',
            name: '画面ダンプ',
          }],
        },
        { name: '別紙', cells: [[0, 0, 'このシートは出力しない']] },
      ],
      { 'screen.png': picture },
    ),
  );

  const before = fs.readFileSync(source);
  const first = await renderLibreOfficeRegionSnapshot({
    sourcePath: source,
    sourceLabel: './design.xlsx',
    sheet: '設計',
    range: 'A1:F5',
    outDir,
    ledgerPath,
  });
  const second = await renderLibreOfficeRegionSnapshot({
    sourcePath: source,
    sourceLabel: './design.xlsx',
    sheet: '設計',
    range: 'a1:f5',
    outDir,
    ledgerPath,
  });

  assert.equal(first.status, 'written');
  assert.equal(second.status, 'unchanged');
  assert.equal(first.manifest.artifact.digest, second.manifest.artifact.digest);
  assert.equal(first.manifest.renderedAtUtc, second.manifest.renderedAtUtc);
  assert.equal(first.manifest.selection.range, 'A1:F5');
  assert.equal(first.candidate.kind, 'region-snapshot');
  assert.equal(first.candidate.fingerprint.digest, first.manifest.artifact.digest);
  assert.match(first.candidate.fingerprint.representation, /region-snapshot-png-v1/u);
  assert.equal(first.manifest.renderer.id, 'mmi.libreoffice-pdf-pdftoppm');
  assert.match(first.manifest.renderer.fontSetDigest, /^sha256:[0-9a-f]{64}$/u);

  const png = fs.readFileSync(first.pngFile);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(sha256(png), first.manifest.artifact.digest);
  assert.deepEqual(fs.readFileSync(source), before);

  const rawManifest = fs.readFileSync(first.manifestFile, 'utf8');
  assert.equal(rawManifest.includes('/usr/bin/python3'), false);
  assert.equal(rawManifest.includes('libreOfficeExecutable'), false);

  const ledger = readLedger(ledgerPath);
  assert.equal(ledger.entries.length, 1);
  assert.equal(ledger.entries[0].kind, 'region-snapshot');
  assert.equal(ledger.entries[0].sheet, '設計');
  assert.equal(ledger.entries[0].place, 'A1:F5');
  assert.equal(ledger.entries[0].outputDigest, first.manifest.artifact.digest);
  assert.equal(ledger.entries[0].conversion.mode, 'region-snapshot-v1');
});
