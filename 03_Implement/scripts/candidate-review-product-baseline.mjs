import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PRODUCT_BASELINE_SCHEMA =
  'mmi.candidate-review-product-baseline/v0';
export const OBSERVATION_SCHEMA =
  'mmi.candidate-review-observation/v2';

function requireNonNegativeInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return value;
}

function requireObservation(value, source) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${source}: observation must be an object`);
  }
  if (value.schema !== OBSERVATION_SCHEMA) {
    throw new Error(
      `${source}: unsupported observation schema ${JSON.stringify(value.schema)}`,
    );
  }
  if (
    !value.source
    || !/^sha256:[0-9a-f]{64}$/u.test(value.source.digest ?? '')
  ) {
    throw new Error(`${source}: source.digest must be sha256`);
  }

  requireNonNegativeInteger(value.durationMs, `${source}: durationMs`);
  requireNonNegativeInteger(
    value.editingInterruptionProxy,
    `${source}: editingInterruptionProxy`,
  );
  if (value.editingInterruptionProxy > 1) {
    throw new Error(
      `${source}: editingInterruptionProxy must be 0 or 1`,
    );
  }

  if (!value.ui || !value.transitions || !value.adjustments) {
    throw new Error(
      `${source}: ui, transitions, and adjustments are required`,
    );
  }

  requireNonNegativeInteger(
    value.ui.selectedCount,
    `${source}: ui.selectedCount`,
  );

  for (const field of [
    'reviewStateChanged',
    'toAccepted',
    'toModified',
    'toRejected',
    'toDeferred',
    'toUnreviewed',
    'newlyImported',
  ]) {
    requireNonNegativeInteger(
      value.transitions[field],
      `${source}: transitions.${field}`,
    );
  }

  for (const kind of ['table', 'imageAlt']) {
    const adjustment = value.adjustments[kind];
    if (!adjustment) {
      throw new Error(`${source}: adjustments.${kind} is required`);
    }
    for (const field of [
      'modifiedItems',
      'originalCharacters',
      'reviewedCharacters',
      'changedSpanCharacters',
    ]) {
      requireNonNegativeInteger(
        adjustment[field],
        `${source}: adjustments.${kind}.${field}`,
      );
    }
  }

  return value;
}

export function parseObservationJsonl(text, source = '<input>') {
  return text
    .split(/\r?\n/u)
    .flatMap((line, index) => {
      if (!line.trim()) return [];
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch (error) {
        throw new Error(
          `${source}:${index + 1}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return [
        requireObservation(
          parsed,
          `${source}:${index + 1}`,
        ),
      ];
    });
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

export function distribution(values) {
  if (values.length === 0) {
    return {
      samples: 0,
      min: 0,
      p50: 0,
      p95: 0,
      max: 0,
      mean: 0,
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p) =>
    sorted[
      Math.min(
        sorted.length - 1,
        Math.floor((sorted.length - 1) * p),
      )
    ] ?? 0;

  return {
    samples: sorted.length,
    min: sorted[0],
    p50: percentile(0.5),
    p95: percentile(0.95),
    max: sorted.at(-1),
    mean: round(
      sorted.reduce((sum, value) => sum + value, 0)
      / sorted.length,
    ),
  };
}

function sum(observations, selector) {
  return observations.reduce(
    (total, item) => total + selector(item),
    0,
  );
}

function adjustmentTotals(observations, kind) {
  return {
    modifiedItems: sum(
      observations,
      (item) => item.adjustments[kind].modifiedItems,
    ),
    originalCharacters: sum(
      observations,
      (item) => item.adjustments[kind].originalCharacters,
    ),
    reviewedCharacters: sum(
      observations,
      (item) => item.adjustments[kind].reviewedCharacters,
    ),
    changedSpanCharacters: sum(
      observations,
      (item) => item.adjustments[kind].changedSpanCharacters,
    ),
  };
}

export function buildProductBaselineReport({
  condition,
  observations,
}) {
  const normalizedCondition = condition?.trim();
  if (!normalizedCondition) {
    throw new Error('condition must not be empty');
  }
  if (!Array.isArray(observations) || observations.length === 0) {
    throw new Error('at least one observation is required');
  }

  observations.forEach((observation, index) =>
    requireObservation(observation, `observation[${index}]`));

  const transitions = {};
  for (const field of [
    'reviewStateChanged',
    'toAccepted',
    'toModified',
    'toRejected',
    'toDeferred',
    'toUnreviewed',
    'newlyImported',
  ]) {
    transitions[field] = sum(
      observations,
      (item) => item.transitions[field],
    );
  }

  const sourceDigests = [
    ...new Set(
      observations.map((item) => item.source.digest),
    ),
  ].sort();

  const selectedCounts = observations.map(
    (item) => item.ui.selectedCount,
  );
  const stateChanges = observations.map(
    (item) => item.transitions.reviewStateChanged,
  );
  const durations = observations.map(
    (item) => item.durationMs,
  );

  return {
    schema: PRODUCT_BASELINE_SCHEMA,
    observationSchema: OBSERVATION_SCHEMA,
    condition: normalizedCondition,
    cohort: {
      sessions: observations.length,
      sources: sourceDigests.length,
      sourceDigests,
    },
    work: {
      durationMs: distribution(durations),
      selectedCandidateCount: {
        total: selectedCounts.reduce((a, b) => a + b, 0),
        perSession: distribution(selectedCounts),
        interpretation:
          'Candidate selections during the review UI. '
          + 'This is not an exact count of all UI actions.',
      },
      reviewStateChangeCount: {
        total: stateChanges.reduce((a, b) => a + b, 0),
        perSession: distribution(stateChanges),
        interpretation:
          'Persisted review-state transitions. '
          + 'No-op inspection and navigation are not counted.',
      },
      editingInterruptionProxySessions: sum(
        observations,
        (item) => item.editingInterruptionProxy,
      ),
      adjustments: {
        table: adjustmentTotals(observations, 'table'),
        imageAlt: adjustmentTotals(
          observations,
          'imageAlt',
        ),
      },
    },
    outcomes: transitions,
    measurementGaps: [
      'exact UI action count is not recorded',
      'source reopen / manual inspection count is not recorded',
      'filter or facet reselection count is not recorded',
      'manual Markdown edits outside the Candidate review flow are not recorded',
      'source non-mutation and failed-import residue require separate safety evidence',
    ],
    authority: {
      sourceMutation:
        'not-measured-by-review-observation',
      failedImportResidue:
        'not-measured-by-review-observation',
      staleAcceptance:
        'not-measured-by-review-observation',
      note:
        'Do not use work-metric improvement to offset '
        + 'a safety or authority violation.',
    },
  };
}

function parseArgs(argv) {
  let condition;
  let output;
  const inputs = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--condition' || arg === '--out') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a value`);
      }
      i += 1;
      if (arg === '--condition') condition = value;
      else output = path.resolve(value);
      continue;
    }

    if (arg.startsWith('--')) {
      throw new Error(`unknown argument: ${arg}`);
    }
    inputs.push(path.resolve(arg));
  }

  if (!condition?.trim()) {
    throw new Error('--condition is required');
  }
  if (inputs.length === 0) {
    throw new Error(
      'at least one Candidate review observation JSONL file is required',
    );
  }

  return {
    condition: condition.trim(),
    inputs,
    ...(output ? { output } : {}),
  };
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const observations = options.inputs.flatMap((input) =>
    parseObservationJsonl(
      fs.readFileSync(input, 'utf8'),
      input,
    ));

  const report = buildProductBaselineReport({
    condition: options.condition,
    observations,
  });

  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) {
    fs.mkdirSync(
      path.dirname(options.output),
      { recursive: true },
    );
    fs.writeFileSync(
      options.output,
      json,
      'utf8',
    );
  }

  process.stdout.write(json);
  return report;
}

if (
  process.argv[1]
  && path.resolve(process.argv[1])
    === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : String(error),
    );
    process.exitCode = 1;
  }
}
