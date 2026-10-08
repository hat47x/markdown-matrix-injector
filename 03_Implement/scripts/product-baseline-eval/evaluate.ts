import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CandidateReviewObservation } from '../../src/application/candidateReviewObservation.js';
import {
  evaluateCandidateReviewProductRuns,
  type ProductBaselineSafetyEvidence,
} from '../../src/evaluation/candidateReviewProductBaseline.js';

interface Options {
  baseline: string;
  assisted: string;
  baselineSafety: string;
  assistedSafety: string;
  fixtureCohort: string;
  protocolId: string;
  baselineId: string;
  assistedId: string;
  output?: string;
}

function parseArgs(argv: readonly string[]): Options {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const name = argv[i];
    if (!name?.startsWith('--')) throw new Error(`unexpected argument: ${name ?? ''}`);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
    values.set(name, value);
    i += 1;
  }

  const required = (
    name: string,
  ): string => {
    const value = values.get(name);
    if (!value?.trim()) throw new Error(`${name} is required`);
    return value;
  };

  const allowed = new Set([
    '--baseline',
    '--assisted',
    '--baseline-safety',
    '--assisted-safety',
    '--cohort',
    '--protocol',
    '--baseline-id',
    '--assisted-id',
    '--out',
  ]);
  for (const name of values.keys()) {
    if (!allowed.has(name)) throw new Error(`unknown argument: ${name}`);
  }

  return {
    baseline: path.resolve(required('--baseline')),
    assisted: path.resolve(required('--assisted')),
    baselineSafety: path.resolve(required('--baseline-safety')),
    assistedSafety: path.resolve(required('--assisted-safety')),
    fixtureCohort: required('--cohort'),
    protocolId: required('--protocol'),
    baselineId: values.get('--baseline-id') ?? 'current-product-baseline',
    assistedId: values.get('--assisted-id') ?? 'assisted',
    ...(values.get('--out')
      ? { output: path.resolve(values.get('--out')!) }
      : {}),
  };
}

function readObservations(file: string): CandidateReviewObservation[] {
  const text = fs.readFileSync(file, 'utf8');
  return text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as CandidateReviewObservation;
      } catch (error) {
        throw new Error(
          `${file} line ${index + 1} is not JSON: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
}

function readSafety(file: string): ProductBaselineSafetyEvidence {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as
    ProductBaselineSafetyEvidence;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`${file} must contain a safety evidence object`);
  }
  return parsed;
}

export function main(argv = process.argv.slice(2)): Record<string, unknown> {
  const options = parseArgs(argv);
  const {
    baseline,
    assisted,
    comparison,
  } = evaluateCandidateReviewProductRuns(
    {
      conditionId: options.baselineId,
      conditionClass: 'current-product-baseline',
      fixtureCohort: options.fixtureCohort,
      protocolId: options.protocolId,
      observations: readObservations(options.baseline),
      safety: readSafety(options.baselineSafety),
    },
    {
      conditionId: options.assistedId,
      conditionClass: 'assisted',
      fixtureCohort: options.fixtureCohort,
      protocolId: options.protocolId,
      observations: readObservations(options.assisted),
      safety: readSafety(options.assistedSafety),
    },
  );

  const report = {
    schema: 'mmi.candidate-review-product-baseline-report/v1',
    fixtureCohort: options.fixtureCohort,
    protocolId: options.protocolId,
    baseline,
    assisted,
    comparison,
  };
  const json = JSON.stringify(report, null, 2) + '\n';
  if (options.output) {
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, json, 'utf8');
  }
  process.stdout.write(json);
  return report;
}

if (
  process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
