export type KnownEmbedQueryParameter =
  | 'mode'
  | 'header'
  | 'columns'
  | 'transpose'
  | 'grep'
  | 'highlightColumn'
  | 'highlightValue'
  | 'formatColumn'
  | 'caption'
  | 'id'
  | 'pageBreak'
  | 'orientation';

export type EmbedQueryParameterConstraint =
  | {
      kind: 'string';
    }
  | {
      kind: 'enum';
      values: readonly string[];
    }
  | {
      kind: 'pattern';
      source: string;
    }
  | {
      kind: 'minLength';
      value: number;
    };

export interface EmbedQueryParameterContractEntry {
  constraint: EmbedQueryParameterConstraint;
}

export const MMI_KNOWN_PARAMETER_CONTRACT: Readonly<
  Record<KnownEmbedQueryParameter, EmbedQueryParameterContractEntry>
> = Object.freeze({
  mode: {
    constraint: { kind: 'enum', values: ['table', 'card'] },
  },
  header: {
    constraint: { kind: 'pattern', source: '^(none|first|[0-9]+)$' },
  },
  columns: {
    constraint: {
      kind: 'pattern',
      source: '^[A-Za-z]+(\\s*,\\s*[A-Za-z]+)*$',
    },
  },
  transpose: {
    constraint: { kind: 'enum', values: ['true'] },
  },
  grep: {
    constraint: { kind: 'minLength', value: 1 },
  },
  highlightColumn: {
    constraint: { kind: 'string' },
  },
  highlightValue: {
    constraint: { kind: 'string' },
  },
  formatColumn: {
    constraint: { kind: 'pattern', source: '^[^:]+:.+$' },
  },
  caption: {
    constraint: { kind: 'string' },
  },
  id: {
    constraint: { kind: 'string' },
  },
  pageBreak: {
    constraint: {
      kind: 'enum',
      values: ['before', 'after', 'both'],
    },
  },
  orientation: {
    constraint: {
      kind: 'enum',
      values: ['landscape', 'portrait'],
    },
  },
});

export type EmbedQueryParameterValidationConstraint =
  | 'enum'
  | 'pattern'
  | 'minLength';

export interface EmbedQueryParameterValidationIssue {
  key: KnownEmbedQueryParameter;
  value: string;
  occurrence: number;
  constraint: EmbedQueryParameterValidationConstraint;
  message: string;
}

export function validateKnownEmbedQueryParameters(
  params: URLSearchParams,
): EmbedQueryParameterValidationIssue[] {
  const occurrences = new Map<KnownEmbedQueryParameter, number>();
  const issues: EmbedQueryParameterValidationIssue[] = [];

  for (const [key, value] of params.entries()) {
    if (!isKnownEmbedQueryParameter(key)) {
      continue;
    }

    const occurrence = occurrences.get(key) ?? 0;
    occurrences.set(key, occurrence + 1);

    const issue = validateKnownValue(key, value, occurrence);
    if (issue) {
      issues.push(issue);
    }
  }

  return issues;
}

export function isKnownEmbedQueryParameter(
  key: string,
): key is KnownEmbedQueryParameter {
  return Object.prototype.hasOwnProperty.call(
    MMI_KNOWN_PARAMETER_CONTRACT,
    key,
  );
}

function validateKnownValue(
  key: KnownEmbedQueryParameter,
  value: string,
  occurrence: number,
): EmbedQueryParameterValidationIssue | undefined {
  const constraint = MMI_KNOWN_PARAMETER_CONTRACT[key].constraint;

  switch (constraint.kind) {
    case 'string':
      return;
    case 'enum':
      if (constraint.values.includes(value)) {
        return;
      }
      return {
        key,
        value,
        occurrence,
        constraint: 'enum',
        message:
          `${key} must be one of: ${constraint.values.join(', ')}; received: ${value}`,
      };
    case 'pattern':
      if (new RegExp(constraint.source, 'u').test(value)) {
        return;
      }
      return {
        key,
        value,
        occurrence,
        constraint: 'pattern',
        message:
          `${key} does not match ${constraint.source}; received: ${value}`,
      };
    case 'minLength':
      if (value.length >= constraint.value) {
        return;
      }
      return {
        key,
        value,
        occurrence,
        constraint: 'minLength',
        message:
          `${key} must contain at least ${constraint.value} character(s).`,
      };
  }
}
