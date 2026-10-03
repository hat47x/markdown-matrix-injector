import { REVIEW_DECISIONS_SCHEMA } from './candidateReviewDecisions.js';
import { LEDGER_SCHEMA } from './importLedger.js';

const sha256Pattern = '^sha256:[0-9a-f]{64}$';
const candidateKinds = [
  'table-range',
  'image',
  'region-snapshot',
  'shape',
  'diagram',
  'tree',
  'choice-list',
  'note',
  'link',
  'section',
] as const;

const primitiveRecord = {
  type: 'object',
  additionalProperties: {
    type: ['string', 'number', 'boolean'],
  },
} as const;

const fingerprint = {
  type: 'object',
  additionalProperties: false,
  required: ['representation', 'digest'],
  properties: {
    representation: { type: 'string', minLength: 1 },
    digest: { type: 'string', pattern: sha256Pattern },
  },
} as const;

const claimBasis = {
  type: 'object',
  additionalProperties: false,
  required: ['index', 'aspect', 'digest'],
  properties: {
    index: { type: 'integer', minimum: 0 },
    aspect: { type: 'string', minLength: 1 },
    digest: { type: 'string', pattern: sha256Pattern },
  },
} as const;

export const importLedgerJsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'MMI Import Ledger v1',
  description:
    'Reviewed/adopted Extracted Candidate occurrences. Epistemic status remains on the Candidate and is not stored as reviewState.',
  type: 'object',
  additionalProperties: false,
  required: ['schema', 'entries'],
  properties: {
    schema: { const: LEDGER_SCHEMA },
    entries: {
      type: 'array',
      items: { $ref: '#/$defs/entry' },
    },
  },
  $defs: {
    fingerprint,
    claimBasis,
    lineageHints: {
      type: 'object',
      additionalProperties: false,
      properties: {
        objectName: { type: 'string' },
        sourceObject: { type: 'string' },
        nearbyTable: { type: 'string' },
      },
    },
    entry: {
      type: 'object',
      additionalProperties: false,
      required: [
        'kind',
        'source',
        'place',
        'fingerprint',
        'sourceDigest',
        'output',
        'conversion',
        'reviewState',
        'basis',
        'reviewedAt',
      ],
      properties: {
        kind: { enum: candidateKinds },
        source: { type: 'string', minLength: 1 },
        sheet: { type: 'string' },
        place: { type: 'string', minLength: 1 },
        fingerprint: { $ref: '#/$defs/fingerprint' },
        sourceDigest: { type: 'string', pattern: sha256Pattern },
        claimBasis: {
          type: 'array',
          items: { $ref: '#/$defs/claimBasis' },
        },
        lineageHints: { $ref: '#/$defs/lineageHints' },
        output: { type: 'string', minLength: 1 },
        outputDigest: { type: 'string', pattern: sha256Pattern },
        conversion: primitiveRecord,
        reviewState: {
          oneOf: [
            { enum: ['accepted', 'modified'] },
            {
              const: 'confirmed',
              deprecated: true,
              description:
                'Legacy mmi.ledger/v1 read compatibility only. New writes use accepted or modified.',
            },
          ],
        },
        basis: { type: 'string', minLength: 1 },
        reviewedAt: { type: 'string', minLength: 1 },
      },
    },
  },
  'x-mmi-contract': LEDGER_SCHEMA,
  'x-mmi-notes': [
    'reviewState is adoption state, not Candidate epistemic status',
    'confirmed is accepted only when reading legacy v1 ledgers and is normalized to accepted in memory',
    'duplicate content at another occurrence never inherits review state automatically',
  ],
} as const;

export const reviewDecisionsJsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'MMI Candidate Review Decisions v1',
  description:
    'Persistent rejected/deferred review decisions for exact Candidate occurrence/content/claim-basis combinations.',
  type: 'object',
  additionalProperties: false,
  required: ['schema', 'entries'],
  properties: {
    schema: { const: REVIEW_DECISIONS_SCHEMA },
    entries: {
      type: 'array',
      items: { $ref: '#/$defs/entry' },
    },
  },
  $defs: {
    fingerprint,
    claimBasis,
    entry: {
      type: 'object',
      additionalProperties: false,
      required: [
        'kind',
        'source',
        'place',
        'fingerprint',
        'claimBasis',
        'decision',
        'basis',
        'reviewedAt',
      ],
      properties: {
        kind: { enum: candidateKinds },
        source: { type: 'string', minLength: 1 },
        sheet: { type: 'string' },
        place: { type: 'string', minLength: 1 },
        fingerprint: { $ref: '#/$defs/fingerprint' },
        claimBasis: {
          type: 'array',
          items: { $ref: '#/$defs/claimBasis' },
        },
        decision: { enum: ['rejected', 'deferred'] },
        basis: { type: 'string', minLength: 1 },
        reviewedAt: { type: 'string', minLength: 1 },
      },
    },
  },
  'x-mmi-contract': REVIEW_DECISIONS_SCHEMA,
  'x-mmi-notes': [
    'a rejection or deferral applies only to the exact occurrence/content/claim basis',
    'accepted and modified are recorded in the import ledger, not in this decision file',
  ],
} as const;

export function importLedgerSchemaJson(): Record<string, unknown> {
  return structuredClone(
    importLedgerJsonSchema,
  ) as unknown as Record<string, unknown>;
}

export function reviewDecisionsSchemaJson(): Record<string, unknown> {
  return structuredClone(
    reviewDecisionsJsonSchema,
  ) as unknown as Record<string, unknown>;
}
