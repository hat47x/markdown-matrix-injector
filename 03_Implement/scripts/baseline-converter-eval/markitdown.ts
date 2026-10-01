#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

import {
  BaselineConverterUnavailableError,
  createMarkItDownCliConverter,
} from '../../src/converters/markItDownCliConverter.js';
import { evaluateMarkItDownBaseline } from '../../src/evaluation/markItDownBaselineEvaluation.js';
import { screenDesignWorkbook } from '../../test/helpers/buildXlsxWithImages.js';

async function main(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      source: { type: 'string' },
      'out-dir': { type: 'string' },
      'report-out': { type: 'string' },
      'expected-version': { type: 'string' },
    },
  });

  if (values['report-out'] && !values['out-dir']) {
    throw new Error('--report-out requires --out-dir so the paired Markdown artifact has a stable root');
  }

  const workRoot = path.resolve(
    values['out-dir'] ?? fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-markitdown-eval-')),
  );
  fs.mkdirSync(workRoot, { recursive: true });

  let sourcePath: string;
  let sourceLabel: string;
  if (values.source) {
    sourcePath = path.resolve(values.source);
    sourceLabel = path.basename(sourcePath);
  } else {
    const fixtureRoot = path.join(workRoot, 'fixture');
    fs.mkdirSync(fixtureRoot, { recursive: true });
    sourcePath = path.join(fixtureRoot, 'issue-0194-screen-design.xlsx');
    sourceLabel = 'issue-0194-screen-design-v1';
    fs.writeFileSync(sourcePath, screenDesignWorkbook().bytes);
  }

  try {
    const converter = await createMarkItDownCliConverter();
    const expectedVersion = values['expected-version'];
    if (expectedVersion && converter.descriptor.version !== expectedVersion) {
      throw new Error(
        `MarkItDown version mismatch: expected ${expectedVersion}, got ${converter.descriptor.version}`,
      );
    }
    const report = await evaluateMarkItDownBaseline({
      sourcePath,
      outputRoot: workRoot,
      converter,
      sourceLabel,
    });
    const text = `${JSON.stringify(report, null, 2)}\n`;

    if (values['report-out']) {
      const reportPath = path.resolve(values['report-out']);
      const artifactPath = path.resolve(workRoot, ...report.markdown.artifact.split('/'));
      if (reportPath === sourcePath || reportPath === artifactPath) {
        throw new Error('--report-out must not overwrite the source or converter artifact');
      }
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
      fs.writeFileSync(reportPath, text, 'utf8');
    } else {
      process.stdout.write(text);
    }
    return 0;
  } catch (error) {
    if (error instanceof BaselineConverterUnavailableError) {
      process.stderr.write(`${JSON.stringify({
        status: 'unavailable',
        converter: 'microsoft.markitdown-cli',
        reason: error.message,
      }, null, 2)}\n`);
      return 2;
    }
    throw error;
  }
}

main(process.argv.slice(2)).then(
  (code) => { process.exitCode = code; },
  (error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  },
);
