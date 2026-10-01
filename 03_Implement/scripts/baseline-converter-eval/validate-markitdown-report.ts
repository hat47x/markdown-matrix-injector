#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import {
  parseMarkItDownBaselineEvaluation,
  verifyMarkItDownBaselineEvaluationArtifact,
} from '../../src/evaluation/markItDownBaselineEvaluation.js';

function main(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      report: { type: 'string' },
      'artifact-root': { type: 'string' },
    },
  });
  if (!values.report || !values['artifact-root']) {
    throw new Error('--report and --artifact-root are required');
  }

  const reportPath = path.resolve(values.report);
  const artifactRoot = path.resolve(values['artifact-root']);
  const report = parseMarkItDownBaselineEvaluation(
    fs.readFileSync(reportPath, 'utf8'),
  );
  verifyMarkItDownBaselineEvaluationArtifact(report, artifactRoot);

  process.stdout.write(`${JSON.stringify({
    valid: true,
    schema: report.schema,
    converter: report.converter,
    source: {
      label: report.source.label,
      digest: report.source.digest,
    },
    markdown: {
      artifact: report.markdown.artifact,
      digest: report.markdown.digest,
      bytes: report.markdown.bytes,
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
