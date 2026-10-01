#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  BaselineConverterUnavailableError,
  createMarkItDownCliConverter,
} from '../../src/converters/markItDownCliConverter.js';
import { evaluateMarkItDownBaseline } from '../../src/evaluation/markItDownBaselineEvaluation.js';
import { screenDesignWorkbook } from '../../test/helpers/buildXlsxWithImages.js';

async function main(): Promise<number> {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mmi-markitdown-eval-'));
  const sourcePath = path.join(tempRoot, 'issue-0194-screen-design.xlsx');
  const outputRoot = path.join(tempRoot, 'markitdown-output');
  fs.writeFileSync(sourcePath, screenDesignWorkbook().bytes);

  try {
    const converter = await createMarkItDownCliConverter();
    const report = await evaluateMarkItDownBaseline({
      sourcePath,
      outputRoot,
      converter,
      sourceLabel: 'issue-0194-screen-design-v1',
    });
    process.stdout.write(`${JSON.stringify({ status: 'evaluated', ...report }, null, 2)}\n`);
    return 0;
  } catch (error) {
    if (error instanceof BaselineConverterUnavailableError) {
      process.stdout.write(`${JSON.stringify({
        status: 'unavailable',
        converter: 'microsoft.markitdown-cli',
        reason: error.message,
      }, null, 2)}\n`);
      return 2;
    }
    throw error;
  }
}

main().then(
  (code) => { process.exitCode = code; },
  (error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  },
);
