
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { main } from '../src/cli/mmi.js';
import { readLedger } from '../src/core/importLedger.js';
import { NATIVE_SVG_SNAPSHOT_RENDERER } from '../src/snapshot/nativeSvgRegionSnapshot.js';
import { screenDesignWorkbook } from './helpers/buildXlsxWithImages.js';

async function quiet(argv: string[]): Promise<{ code: number; out: string; err: string }> {
  const outChunks: string[] = [];
  const errChunks: string[] = [];
  const originalOut = process.stdout.write.bind(process.stdout);
  const originalError = console.error;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    outChunks.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  console.error = (...args: unknown[]) => {
    errChunks.push(args.map(String).join(' '));
  };
  try {
    return { code: await main(argv), out: outChunks.join(''), err: errChunks.join('\n') };
  } finally {
    process.stdout.write = originalOut;
    console.error = originalError;
  }
}

test('mmi snapshot --renderer native-svg works without LibreOffice and records the shared ledger', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-native-snapshot-cli-'));
  const source = path.join(root, 'design.xlsx');
  fs.writeFileSync(source, screenDesignWorkbook().bytes);

  const result = await quiet([
    'snapshot',
    source,
    '--root', root,
    '--sheet', '画面一覧',
    '--range', 'A1:G6',
    '--renderer', 'native-svg',
    '--json',
  ]);

  assert.equal(result.code, 0, result.err);
  const summary = JSON.parse(result.out);
  assert.equal(summary.renderer.id, NATIVE_SVG_SNAPSHOT_RENDERER);
  assert.equal(typeof summary.svg, 'string');
  assert.equal(summary.png, undefined);
  assert.equal(summary.artifact, summary.svg);
  assert.match(summary.digest, /^sha256:[0-9a-f]{64}$/u);
  assert.ok(summary.limitations.includes('font-rasterization-environment-dependent'));
  assert.equal(fs.existsSync(path.resolve(summary.svg)), true);
  assert.equal(fs.existsSync(path.resolve(summary.manifest)), true);

  const ledger = readLedger(path.join(root, 'mmi-ledger.json'));
  assert.equal(ledger.entries.length, 1);
  assert.equal(ledger.entries[0].kind, 'region-snapshot');
  assert.equal(ledger.entries[0].conversion.mode, 'region-snapshot-native-svg-v1');
});

test('native SVG snapshot rejects LibreOffice-only dpi before writing artifacts', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-native-snapshot-cli-'));
  const source = path.join(root, 'design.xlsx');
  fs.writeFileSync(source, screenDesignWorkbook().bytes);

  const result = await quiet([
    'snapshot',
    source,
    '--root', root,
    '--sheet', '画面一覧',
    '--range', 'A1:G6',
    '--renderer', 'native-svg',
    '--dpi', '200',
  ]);

  assert.equal(result.code, 2);
  assert.match(result.err, /--dpi applies only to the libreoffice renderer/u);
  assert.equal(fs.existsSync(path.join(root, 'assets', 'snapshots')), false);
  assert.equal(fs.existsSync(path.join(root, 'mmi-ledger.json')), false);
});

test('snapshot rejects unknown renderer names', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-native-snapshot-cli-'));
  const source = path.join(root, 'design.xlsx');
  fs.writeFileSync(source, screenDesignWorkbook().bytes);

  const result = await quiet([
    'snapshot',
    source,
    '--root', root,
    '--sheet', '画面一覧',
    '--range', 'A1:G6',
    '--renderer', 'unknown',
  ]);

  assert.equal(result.code, 2);
  assert.match(result.err, /must be libreoffice or native-svg/u);
});
