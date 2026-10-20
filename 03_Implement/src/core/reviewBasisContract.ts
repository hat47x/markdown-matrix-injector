/** Public contract for the explicit review-basis sidecar (issue #522). */
export const REVIEW_BASIS_SCHEMA = 'mmi.review-basis/v1' as const;

export function reviewBasisSchemaJson(): Record<string, unknown> {
  const record = {
    type: 'object',
    additionalProperties: false,
    required: ['reference', 'source', 'logicalTableDigest', 'recordedAt'],
    properties: {
      reference: { type: 'string' },
      source: { type: 'string' },
      target: { type: 'string' },
      range: { type: 'string' },
      logicalTableDigest: { type: 'string' },
      recordedAt: { type: 'string' },
    },
  };
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: REVIEW_BASIS_SCHEMA,
    title: 'MMI review-basis sidecar v1',
    type: 'object',
    additionalProperties: false,
    required: ['schema', 'documents'],
    properties: {
      schema: { const: REVIEW_BASIS_SCHEMA },
      documents: {
        type: 'object',
        additionalProperties: {
          type: 'array',
          items: record,
        },
      },
    },
  };
}
