/**
 * Frozen external-evaluation handoff verification for issue-0200.
 *
 * The generic report validator checks schema/artifact integrity. This layer
 * additionally proves that the returned report belongs to the exact frozen
 * MarkItDown version and issue-0194 fixture identity requested by the handoff.
 */
import fs from 'node:fs';

import {
  parseMarkItDownBaselineEvaluation,
  verifyMarkItDownBaselineEvaluationArtifact,
  type MarkItDownBaselineEvaluation,
} from './markItDownBaselineEvaluation.js';

export interface MarkItDownEvaluationHandoff {
  schema: 'mmi.baseline-converter-evaluation-handoff/v1';
  request_id: string;
  status: 'ready_for_external_execution';
  converter: {
    id: string;
    requested_version: string;
  };
  fixture: {
    source_label: string;
    expected_sheet_count: number;
    expected_sheets: string[];
    expected_images: Array<{
      sheet: string;
      name: string;
      range: string | null;
    }>;
  };
  execution: {
    markdown_artifact: string;
  };
  acceptance: {
    automatic_import_decision_must_be: 'none';
  };
}

export function readMarkItDownEvaluationHandoff(
  handoffPath: string,
): MarkItDownEvaluationHandoff {
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(handoffPath, 'utf8'));
  } catch (error) {
    throw new Error('MarkItDown handoff is not valid readable JSON', { cause: error });
  }
  assertHandoff(value);
  return value;
}

export function verifyMarkItDownEvaluationHandoff(options: {
  handoff: MarkItDownEvaluationHandoff;
  reportText: string;
  artifactRoot: string;
}): MarkItDownBaselineEvaluation {
  const { handoff } = options;
  assertHandoff(handoff);
  const report = parseMarkItDownBaselineEvaluation(options.reportText);

  if (report.converter.id !== handoff.converter.id) {
    throw new Error(
      `handoff converter id mismatch: expected ${handoff.converter.id}, got ${report.converter.id}`,
    );
  }
  if (report.converter.version !== handoff.converter.requested_version) {
    throw new Error(
      `handoff converter version mismatch: expected ${handoff.converter.requested_version}, got ${report.converter.version}`,
    );
  }
  if (report.source.label !== handoff.fixture.source_label) {
    throw new Error(
      `handoff source label mismatch: expected ${handoff.fixture.source_label}, got ${report.source.label}`,
    );
  }
  if (report.source.sheetCount !== handoff.fixture.expected_sheet_count) {
    throw new Error(
      `handoff sheet count mismatch: expected ${handoff.fixture.expected_sheet_count}, got ${report.source.sheetCount}`,
    );
  }

  const reportSheets = report.markdown.sheetEvidence.map((item) => item.sheet);
  if (!sameStrings(reportSheets, handoff.fixture.expected_sheets)) {
    throw new Error(
      `handoff sheet identity mismatch: expected ${JSON.stringify(handoff.fixture.expected_sheets)}, got ${JSON.stringify(reportSheets)}`,
    );
  }

  const reportImages = report.source.images.map((image) => ({
    sheet: image.sheet,
    name: image.name ?? '',
    range: image.range ?? null,
  }));
  if (!sameImageIdentity(reportImages, handoff.fixture.expected_images)) {
    throw new Error('handoff image occurrence identity mismatch');
  }

  if (report.markdown.artifact !== handoff.execution.markdown_artifact) {
    throw new Error(
      `handoff Markdown artifact mismatch: expected ${handoff.execution.markdown_artifact}, got ${report.markdown.artifact}`,
    );
  }
  if (
    report.reconciliation.automaticImportDecision
    !== handoff.acceptance.automatic_import_decision_must_be
  ) {
    throw new Error('handoff report carries unauthorized automatic import decision');
  }

  verifyMarkItDownBaselineEvaluationArtifact(report, options.artifactRoot);
  return report;
}

function assertHandoff(value: unknown): asserts value is MarkItDownEvaluationHandoff {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('MarkItDown handoff must be an object');
  }
  const handoff = value as Record<string, unknown>;
  if (handoff.schema !== 'mmi.baseline-converter-evaluation-handoff/v1') {
    throw new Error('unsupported MarkItDown handoff schema');
  }
  if (handoff.status !== 'ready_for_external_execution') {
    throw new Error('MarkItDown handoff is not ready for external execution');
  }

  const converter = recordAt(handoff, 'converter');
  nonEmptyAt(converter, 'id', 'converter.id');
  nonEmptyAt(converter, 'requested_version', 'converter.requested_version');

  const fixture = recordAt(handoff, 'fixture');
  nonEmptyAt(fixture, 'source_label', 'fixture.source_label');
  const count = fixture.expected_sheet_count;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) {
    throw new Error('fixture.expected_sheet_count must be a positive integer');
  }
  if (!Array.isArray(fixture.expected_sheets)
    || fixture.expected_sheets.length !== count
    || !fixture.expected_sheets.every((item) => typeof item === 'string' && item.length > 0)) {
    throw new Error('fixture.expected_sheets must match expected_sheet_count');
  }
  if (!Array.isArray(fixture.expected_images)) {
    throw new Error('fixture.expected_images must be an array');
  }
  for (const [index, item] of fixture.expected_images.entries()) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`fixture.expected_images[${index}] must be an object`);
    }
    const image = item as Record<string, unknown>;
    nonEmptyAt(image, 'sheet', `fixture.expected_images[${index}].sheet`);
    nonEmptyAt(image, 'name', `fixture.expected_images[${index}].name`);
    if (image.range !== null && (typeof image.range !== 'string' || image.range.length === 0)) {
      throw new Error(`fixture.expected_images[${index}].range must be string or null`);
    }
  }

  const execution = recordAt(handoff, 'execution');
  nonEmptyAt(execution, 'markdown_artifact', 'execution.markdown_artifact');

  const acceptance = recordAt(handoff, 'acceptance');
  if (acceptance.automatic_import_decision_must_be !== 'none') {
    throw new Error('handoff may not authorize an automatic import decision');
  }
}

function recordAt(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${key} must be an object`);
  }
  return value as Record<string, unknown>;
}

function nonEmptyAt(record: Record<string, unknown>, key: string, name: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
}

function sameStrings(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function sameImageIdentity(
  actual: ReadonlyArray<{ sheet: string; name: string; range: string | null }>,
  expected: ReadonlyArray<{ sheet: string; name: string; range: string | null }>,
): boolean {
  return actual.length === expected.length
    && actual.every((value, index) =>
      value.sheet === expected[index].sheet
      && value.name === expected[index].name
      && value.range === expected[index].range);
}
