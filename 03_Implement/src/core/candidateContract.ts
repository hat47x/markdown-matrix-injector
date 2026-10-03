import type { Candidate } from './candidate.js';

export const SEMANTIC_CANDIDATE_CONTRACT =
  'mmi.semantic-candidate/v1' as const;

const sha256Pattern = '^sha256:[0-9a-f]{64}$';

const primitiveRecord = {
  type: 'object',
  additionalProperties: {
    type: ['string', 'number', 'boolean'],
  },
} as const;

export const semanticCandidateJsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'MMI Semantic Candidate v1',
  description:
    'Machine-readable contract for MMI Semantic Candidate. Review/adoption state is intentionally not part of this object.',
  type: 'object',
  additionalProperties: false,
  required: [
    'kind',
    'locator',
    'status',
    'execution',
    'method',
    'claims',
    'provenance',
    'fingerprint',
    'scores',
  ],
  properties: {
    kind: {
      enum: [
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
      ],
    },
    locator: {
      type: 'object',
      additionalProperties: false,
      required: ['source', 'sourceDigest'],
      properties: {
        source: { type: 'string', minLength: 1 },
        sourceDigest: { type: 'string', pattern: sha256Pattern },
        sheet: { type: 'string' },
        range: { type: 'string' },
        structuralPath: { type: 'string' },
      },
    },
    status: {
      enum: ['observed', 'inferred', 'abstained'],
    },
    execution: {
      enum: ['deterministic', 'provider-dependent'],
    },
    method: {
      enum: ['M0', 'M1', 'M2', 'M3', 'M4', 'M5'],
    },
    claims: {
      type: 'array',
      minItems: 1,
      items: { $ref: '#/$defs/claim' },
    },
    provenance: { $ref: '#/$defs/provenance' },
    fingerprint: { $ref: '#/$defs/fingerprint' },
    scores: {
      type: 'array',
      items: { $ref: '#/$defs/providerScore' },
    },
    reference: { type: 'string' },
  },
  allOf: [
    {
      if: {
        properties: {
          execution: { const: 'deterministic' },
        },
        required: ['execution'],
      },
      then: {
        properties: {
          scores: { maxItems: 0 },
          provenance: {
            properties: {
              run: {
                properties: {
                  execution: { const: 'deterministic' },
                },
                required: ['execution'],
              },
            },
          },
          claims: {
            items: {
              properties: {
                execution: { const: 'deterministic' },
              },
              required: ['execution'],
            },
          },
        },
      },
      else: {
        properties: {
          provenance: {
            properties: {
              run: {
                properties: {
                  execution: { const: 'provider-dependent' },
                },
                required: ['execution'],
              },
            },
          },
        },
      },
    },
    {
      if: {
        properties: {
          status: { const: 'abstained' },
        },
        required: ['status'],
      },
      then: {
        properties: {
          claims: {
            items: {
              properties: {
                status: { const: 'abstained' },
              },
              required: ['status'],
            },
          },
        },
      },
      else: {
        properties: {
          claims: {
            contains: {
              properties: {
                status: {
                  enum: ['observed', 'inferred'],
                },
              },
              required: ['status'],
            },
            minContains: 1,
          },
        },
      },
    },
  ],
  $defs: {
    evidence: {
      type: 'object',
      additionalProperties: false,
      required: ['code'],
      properties: {
        code: { type: 'string', minLength: 1 },
        detail: { type: 'string' },
      },
    },
    claim: {
      type: 'object',
      additionalProperties: false,
      required: [
        'aspect',
        'status',
        'execution',
        'method',
        'reasonCode',
      ],
      properties: {
        aspect: { type: 'string', minLength: 1 },
        value: {
          oneOf: [
            { type: 'string' },
            {
              type: 'array',
              items: { type: 'string' },
            },
          ],
        },
        status: {
          enum: ['observed', 'inferred', 'abstained'],
        },
        execution: {
          enum: ['deterministic', 'provider-dependent'],
        },
        method: {
          enum: ['M0', 'M1', 'M2', 'M3', 'M4', 'M5'],
        },
        reasonCode: { type: 'string', minLength: 1 },
        evidence: {
          type: 'array',
          items: { $ref: '#/$defs/evidence' },
        },
      },
      allOf: [
        {
          if: {
            properties: {
              status: { const: 'abstained' },
            },
            required: ['status'],
          },
          then: {
            not: { required: ['value'] },
          },
          else: {
            required: ['value'],
          },
        },
        {
          if: {
            properties: {
              status: { const: 'observed' },
            },
            required: ['status'],
          },
          then: {
            properties: {
              method: { const: 'M0' },
            },
          },
        },
      ],
    },
    deterministicRun: {
      type: 'object',
      additionalProperties: false,
      required: [
        'execution',
        'inputDigest',
        'config',
        'implementationVersion',
      ],
      properties: {
        execution: { const: 'deterministic' },
        inputDigest: { type: 'string', pattern: sha256Pattern },
        config: primitiveRecord,
        implementationVersion: { type: 'string', minLength: 1 },
      },
    },
    providerDependentRun: {
      type: 'object',
      additionalProperties: false,
      required: [
        'execution',
        'inputDigest',
        'provider',
        'model',
        'artifactVersion',
        'parameters',
      ],
      properties: {
        execution: { const: 'provider-dependent' },
        inputDigest: { type: 'string', pattern: sha256Pattern },
        provider: { type: 'string', minLength: 1 },
        model: { type: 'string', minLength: 1 },
        artifactVersion: { type: 'string', minLength: 1 },
        parameters: primitiveRecord,
      },
    },
    provenance: {
      type: 'object',
      additionalProperties: false,
      required: ['algorithm', 'run'],
      properties: {
        algorithm: { type: 'string', minLength: 1 },
        run: {
          oneOf: [
            { $ref: '#/$defs/deterministicRun' },
            { $ref: '#/$defs/providerDependentRun' },
          ],
        },
      },
    },
    fingerprint: {
      type: 'object',
      additionalProperties: false,
      required: ['algorithm', 'representation', 'digest'],
      properties: {
        algorithm: { const: 'sha256' },
        representation: { type: 'string', minLength: 1 },
        digest: { type: 'string', pattern: sha256Pattern },
      },
    },
    providerScore: {
      type: 'object',
      additionalProperties: false,
      required: ['provider', 'scale', 'value'],
      properties: {
        provider: { type: 'string', minLength: 1 },
        scale: { type: 'string', minLength: 1 },
        value: { type: 'number' },
      },
    },
  },
  'x-mmi-contract': SEMANTIC_CANDIDATE_CONTRACT,
  'x-mmi-notes': [
    'review/adoption state is stored downstream and never changes epistemic status',
    'provider scores are namespaced by provider and scale and must not be merged',
    'runtime candidateProblem() additionally checks inputDigest/sourceDigest equality and duplicate provider/scale scores',
  ],
} as const;

export type SemanticCandidateJsonSchema =
  typeof semanticCandidateJsonSchema;

/**
 * Returns a detached JSON value so callers cannot mutate the process-global
 * contract object shared by other requests.
 */
export function semanticCandidateSchemaJson(): Record<string, unknown> {
  return structuredClone(
    semanticCandidateJsonSchema,
  ) as unknown as Record<string, unknown>;
}

/** Compile-time anchor between this public contract module and Candidate. */
export function candidateContractTypeAnchor(candidate: Candidate): Candidate {
  return candidate;
}
