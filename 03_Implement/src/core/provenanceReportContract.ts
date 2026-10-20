/**
 * Public contract for the per-document provenance report (issue #525).
 *
 * The report is deliberately content-light: it identifies sources, adopted
 * assets, fingerprints and review status, but does not embed source cell
 * values. That keeps a report safe to attach to a review or a CI run.
 */
export const PROVENANCE_REPORT_SCHEMA = 'mmi.provenance-report/v1' as const;

export function provenanceReportSchemaJson(): Record<string, unknown> {
  const diagnostic = {
    type: 'object',
    additionalProperties: false,
    required: ['file', 'line', 'column', 'severity', 'code', 'message'],
    properties: {
      file: { type: 'string' },
      line: { type: 'integer', minimum: 1 },
      column: { type: 'integer', minimum: 1 },
      severity: { type: 'string' },
      code: { type: 'string' },
      message: { type: 'string' },
    },
  };
  const linked = {
    type: 'object',
    additionalProperties: false,
    required: ['line', 'reference', 'source', 'status'],
    properties: {
      line: { type: 'integer', minimum: 1 },
      reference: { type: 'string' },
      source: { type: 'string' },
      status: { type: 'string', enum: ['resolved', 'missing', 'outside-root'] },
      sourceDigest: { type: 'string' },
      sheet: { type: 'string' },
      range: { type: 'string' },
    },
  };
  const extracted = {
    type: 'object',
    additionalProperties: false,
    required: ['line', 'kind', 'source', 'fingerprint', 'freshness'],
    properties: {
      line: { type: 'integer', minimum: 1 },
      kind: { type: 'string', enum: ['image', 'table-range', 'tree'] },
      source: { type: 'string' },
      place: { type: 'string' },
      fingerprint: { type: 'string' },
      freshness: {
        type: 'string',
        enum: ['fresh', 'stale', 'missing', 'untracked', 'unknown'],
      },
      ledger: {
        type: 'object',
        additionalProperties: false,
        required: ['output', 'conversion', 'reviewState', 'basis'],
        properties: {
          output: { type: 'string' },
          outputDigest: { type: 'string' },
          conversion: { type: 'object' },
          reviewState: { type: 'string' },
          basis: { type: 'string' },
          reviewedAt: { type: 'string' },
        },
      },
      problems: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['code', 'message'],
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  };
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: PROVENANCE_REPORT_SCHEMA,
    title: 'MMI provenance report v1',
    type: 'object',
    additionalProperties: false,
    required: [
      'schema',
      'document',
      'summary',
      'linked',
      'extracted',
      'review',
      'diagnostics',
    ],
    properties: {
      schema: { const: PROVENANCE_REPORT_SCHEMA },
      document: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'digest'],
        properties: {
          path: { type: 'string' },
          digest: { type: 'string' },
        },
      },
      summary: {
        type: 'object',
        additionalProperties: false,
        required: [
          'linked',
          'extracted',
          'diagnostics',
          'stale',
          'missingSources',
          'reviewStale',
          'reviewUnrecorded',
        ],
        properties: {
          linked: { type: 'integer', minimum: 0 },
          extracted: { type: 'integer', minimum: 0 },
          diagnostics: { type: 'integer', minimum: 0 },
          stale: { type: 'integer', minimum: 0 },
          missingSources: { type: 'integer', minimum: 0 },
          reviewStale: { type: 'integer', minimum: 0 },
          reviewUnrecorded: { type: 'integer', minimum: 0 },
        },
      },
      linked: { type: 'array', items: linked },
      extracted: { type: 'array', items: extracted },
      review: {
        type: 'object',
        additionalProperties: false,
        required: ['status', 'file', 'references', 'stale', 'unrecorded', 'unverifiable'],
        properties: {
          status: { type: 'string', enum: ['not-configured', 'recorded', 'partial'] },
          file: { type: 'string' },
          reasonCode: { type: 'string' },
          message: { type: 'string' },
          trackingIssue: { type: 'string' },
          stale: { type: 'integer', minimum: 0 },
          unrecorded: { type: 'integer', minimum: 0 },
          unverifiable: { type: 'integer', minimum: 0 },
          references: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['reference', 'source', 'status'],
              properties: {
                reference: { type: 'string' },
                source: { type: 'string' },
                status: {
                  type: 'string',
                  enum: ['fresh', 'stale', 'unrecorded', 'unverifiable'],
                },
                recordedDigest: { type: 'string' },
                currentDigest: { type: 'string' },
                reasonCode: { type: 'string' },
              },
            },
          },
        },
      },
      diagnostics: { type: 'array', items: diagnostic },
    },
  };
}
