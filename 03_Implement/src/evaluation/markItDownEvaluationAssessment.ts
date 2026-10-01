/**
 * Descriptive assessment of a validated MarkItDown baseline evaluation.
 *
 * This intentionally does not score, rank or authorize import. It summarizes
 * observable preservation/loss evidence from the returned Markdown artifact.
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  readMarkItDownEvaluationHandoff,
  verifyMarkItDownEvaluationHandoff,
  type MarkItDownEvaluationHandoff,
} from './markItDownEvaluationHandoff.js';

export interface MarkItDownAssessmentSpec {
  schema: 'mmi.baseline-converter-assessment-spec/v1';
  assessment_id: string;
  handoff_request_id: string;
  source_label: string;
  text_sentinels: string[];
  source_facts: {
    sheet_count: number;
    image_occurrence_count: number;
    known_table: { sheet: string; range: string };
  };
  observations: string[];
  interpretation_boundary: {
    no_quality_score: true;
    no_pass_fail_threshold: true;
    no_automatic_import_decision: true;
    findings_are_descriptive: true;
  };
}

export interface MarkItDownDescriptiveAssessment {
  schema: 'mmi.baseline-converter-assessment/v1';
  assessment_id: string;
  handoff_request_id: string;
  converter: { id: string; version: string };
  source: { label: string; digest: string };
  observations: {
    sheetHeadings: {
      present: string[];
      missing: string[];
    };
    textSentinels: {
      present: string[];
      missing: string[];
    };
    tableStructure: {
      markdownTableSeparatorLineCount: number;
      knownSourceTable: { sheet: string; range: string };
    };
    images: {
      sourceOccurrenceCount: number;
      markdownImageReferenceCount: number;
      sourceOccurrenceIdentityAvailableInEvidence: boolean;
      markdownCandidateAddressability: 'not-provided-by-baseline-artifact';
    };
  };
  interpretation_boundary: MarkItDownAssessmentSpec['interpretation_boundary'];
}

export function readMarkItDownAssessmentSpec(
  specPath: string,
): MarkItDownAssessmentSpec {
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  } catch (error) {
    throw new Error('MarkItDown assessment spec is not valid readable JSON', { cause: error });
  }
  assertAssessmentSpec(value);
  return value;
}

export function assessMarkItDownEvaluation(options: {
  handoff: MarkItDownEvaluationHandoff;
  spec: MarkItDownAssessmentSpec;
  reportText: string;
  artifactRoot: string;
}): MarkItDownDescriptiveAssessment {
  const { handoff, spec } = options;
  assertAssessmentSpec(spec);
  if (spec.handoff_request_id !== handoff.request_id) {
    throw new Error('assessment spec does not belong to the supplied handoff request');
  }

  const report = verifyMarkItDownEvaluationHandoff({
    handoff,
    reportText: options.reportText,
    artifactRoot: options.artifactRoot,
  });
  if (report.source.label !== spec.source_label) {
    throw new Error('assessment spec source label does not match validated report');
  }
  if (report.source.sheetCount !== spec.source_facts.sheet_count) {
    throw new Error('assessment spec sheet count does not match validated report');
  }
  if (report.source.images.length !== spec.source_facts.image_occurrence_count) {
    throw new Error('assessment spec image occurrence count does not match validated report');
  }

  const artifactPath = path.resolve(
    options.artifactRoot,
    ...report.markdown.artifact.split('/'),
  );
  const markdown = fs.readFileSync(artifactPath, 'utf8');

  const presentSheets = report.markdown.sheetEvidence
    .filter((item) => item.markdownHeadingPresent)
    .map((item) => item.sheet);
  const missingSheets = report.markdown.sheetEvidence
    .filter((item) => !item.markdownHeadingPresent)
    .map((item) => item.sheet);

  const presentSentinels: string[] = [];
  const missingSentinels: string[] = [];
  for (const sentinel of spec.text_sentinels) {
    (markdown.includes(sentinel) ? presentSentinels : missingSentinels).push(sentinel);
  }

  return {
    schema: 'mmi.baseline-converter-assessment/v1',
    assessment_id: spec.assessment_id,
    handoff_request_id: handoff.request_id,
    converter: { ...report.converter },
    source: {
      label: report.source.label,
      digest: report.source.digest,
    },
    observations: {
      sheetHeadings: {
        present: presentSheets,
        missing: missingSheets,
      },
      textSentinels: {
        present: presentSentinels,
        missing: missingSentinels,
      },
      tableStructure: {
        markdownTableSeparatorLineCount: report.markdown.tableSeparatorLineCount,
        knownSourceTable: { ...spec.source_facts.known_table },
      },
      images: {
        sourceOccurrenceCount: report.source.images.length,
        markdownImageReferenceCount: report.markdown.imageReferenceCount,
        sourceOccurrenceIdentityAvailableInEvidence: report.source.images.length > 0,
        markdownCandidateAddressability: report.reconciliation.candidateAddressability,
      },
    },
    interpretation_boundary: { ...spec.interpretation_boundary },
  };
}

export function assessMarkItDownEvaluationFromFiles(options: {
  handoffPath: string;
  specPath: string;
  reportPath: string;
  artifactRoot: string;
}): MarkItDownDescriptiveAssessment {
  return assessMarkItDownEvaluation({
    handoff: readMarkItDownEvaluationHandoff(options.handoffPath),
    spec: readMarkItDownAssessmentSpec(options.specPath),
    reportText: fs.readFileSync(options.reportPath, 'utf8'),
    artifactRoot: options.artifactRoot,
  });
}

function assertAssessmentSpec(value: unknown): asserts value is MarkItDownAssessmentSpec {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('MarkItDown assessment spec must be an object');
  }
  const spec = value as Record<string, unknown>;
  assertExactKeys('assessment spec', spec, [
    'schema',
    'assessment_id',
    'handoff_request_id',
    'source_label',
    'text_sentinels',
    'source_facts',
    'observations',
    'interpretation_boundary',
  ]);
  if (spec.schema !== 'mmi.baseline-converter-assessment-spec/v1') {
    throw new Error('unsupported MarkItDown assessment spec schema');
  }
  nonEmpty(spec.assessment_id, 'assessment_id');
  nonEmpty(spec.handoff_request_id, 'handoff_request_id');
  nonEmpty(spec.source_label, 'source_label');
  if (!Array.isArray(spec.text_sentinels)
    || spec.text_sentinels.length === 0
    || !spec.text_sentinels.every((item) => typeof item === 'string' && item.length > 0)) {
    throw new Error('text_sentinels must be a non-empty string array');
  }
  if (new Set(spec.text_sentinels).size !== spec.text_sentinels.length) {
    throw new Error('text_sentinels must not contain duplicates');
  }

  const facts = asRecord(spec.source_facts, 'source_facts');
  assertExactKeys('source_facts', facts, ['sheet_count', 'image_occurrence_count', 'known_table']);
  positiveInteger(facts.sheet_count, 'source_facts.sheet_count');
  positiveInteger(facts.image_occurrence_count, 'source_facts.image_occurrence_count');
  const knownTable = asRecord(facts.known_table, 'source_facts.known_table');
  assertExactKeys('source_facts.known_table', knownTable, ['sheet', 'range']);
  nonEmpty(knownTable.sheet, 'source_facts.known_table.sheet');
  nonEmpty(knownTable.range, 'source_facts.known_table.range');

  const expectedObservations = [
    'sheet_heading_presence',
    'text_sentinel_presence',
    'markdown_table_separator_line_count',
    'markdown_image_reference_count',
    'candidate_addressability',
  ];
  if (!Array.isArray(spec.observations)
    || spec.observations.length !== expectedObservations.length
    || !spec.observations.every((item, index) => item === expectedObservations[index])) {
    throw new Error('observations must match the frozen descriptive observation set');
  }
  const boundary = asRecord(spec.interpretation_boundary, 'interpretation_boundary');
  assertExactKeys('interpretation_boundary', boundary, [
    'no_quality_score',
    'no_pass_fail_threshold',
    'no_automatic_import_decision',
    'findings_are_descriptive',
  ]);
  for (const key of [
    'no_quality_score',
    'no_pass_fail_threshold',
    'no_automatic_import_decision',
    'findings_are_descriptive',
  ]) {
    if (boundary[key] !== true) {
      throw new Error(`interpretation_boundary.${key} must be true`);
    }
  }
}


function assertExactKeys(
  name: string,
  record: Record<string, unknown>,
  expected: readonly string[],
): void {
  const expectedSet = new Set(expected);
  for (const key of Object.keys(record)) {
    if (!expectedSet.has(key)) throw new Error(`${name} has unexpected field: ${key}`);
  }
  for (const key of expected) {
    if (!(key in record)) throw new Error(`${name} is missing field: ${key}`);
  }
}

function asRecord(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function nonEmpty(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
}

function positiveInteger(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
}
