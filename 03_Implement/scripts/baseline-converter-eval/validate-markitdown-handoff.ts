#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import {
  readMarkItDownEvaluationHandoff,
  verifyMarkItDownEvaluationHandoff,
} from '../../src/evaluation/markItDownEvaluationHandoff.js';

function main(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      handoff: { type: 'string' },
      report: { type: 'string' },
      'artifact-root': { type: 'string' },
    },
  });
  if (!values.handoff || !values.report || !values['artifact-root']) {
    throw new Error('--handoff, --report and --artifact-root are required');
  }

  const handoff = readMarkItDownEvaluationHandoff(path.resolve(values.handoff));
  const report = verifyMarkItDownEvaluationHandoff({
    handoff,
    reportText: fs.readFileSync(path.resolve(values.report), 'utf8'),
    artifactRoot: path.resolve(values['artifact-root']),
  });

  process.stdout.write(`${JSON.stringify({
    valid: true,
    request_id: handoff.request_id,
    converter: report.converter,
    source: { label: report.source.label, digest: report.source.digest },
    sheets: report.markdown.sheetEvidence,
    images: report.source.images,
    markdown: {
      artifact: report.markdown.artifact,
      digest: report.markdown.digest,
      bytes: report.markdown.bytes,
      tableSeparatorLineCount: report.markdown.tableSeparatorLineCount,
      imageReferenceCount: report.markdown.imageReferenceCount,
    },
  }, null, 2)}\n`);
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
}
