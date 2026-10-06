#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { compareRegionSnapshotRenderers } from '../../src/snapshot/regionSnapshotComparison.js';

async function main(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      source: { type: 'string' },
      sheet: { type: 'string' },
      range: { type: 'string' },
      'out-dir': { type: 'string' },
      'report-out': { type: 'string' },
      dpi: { type: 'string' },
    },
  });
  if (!values.source || !values.sheet || !values.range || !values['out-dir']) {
    throw new Error('--source, --sheet, --range and --out-dir are required');
  }
  const outDir = path.resolve(values['out-dir']);
  const report = await compareRegionSnapshotRenderers({
    sourcePath: path.resolve(values.source),
    sourceLabel: path.basename(values.source),
    sheet: values.sheet,
    range: values.range,
    outDir,
    ...(values.dpi ? { dpi: Number(values.dpi) } : {}),
  });
  const text = JSON.stringify(report, null, 2) + '\n';
  if (values['report-out']) {
    const reportOut = path.resolve(values['report-out']);
    fs.mkdirSync(path.dirname(reportOut), { recursive: true });
    fs.writeFileSync(reportOut, text, 'utf8');
  } else {
    process.stdout.write(text);
  }
  return report.libreOffice.status === 'rendered' ? 0 : 2;
}

main(process.argv.slice(2)).then(
  (code) => { process.exitCode = code; },
  (error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  },
);
