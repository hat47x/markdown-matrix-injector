#!/usr/bin/env node
import { parseArgs } from 'node:util';

import { assessMarkItDownEvaluationFromFiles } from '../../src/evaluation/markItDownEvaluationAssessment.js';

function main(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      handoff: { type: 'string' },
      spec: { type: 'string' },
      report: { type: 'string' },
      'artifact-root': { type: 'string' },
    },
  });
  if (!values.handoff || !values.spec || !values.report || !values['artifact-root']) {
    throw new Error('--handoff, --spec, --report and --artifact-root are required');
  }

  const assessment = assessMarkItDownEvaluationFromFiles({
    handoffPath: values.handoff,
    specPath: values.spec,
    reportPath: values.report,
    artifactRoot: values['artifact-root'],
  });
  process.stdout.write(`${JSON.stringify(assessment, null, 2)}\n`);
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
}
