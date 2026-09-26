import type {
  WorksheetFormatSnapshot,
} from './worksheetFormatFeatureAdapter.js';

export const STRUCTURED_ARTIFACT_BODY_CANDIDATE_SEMANTICS =
  'sai-body-type-transition-v0' as const;

export const MMI_STRUCTURED_ARTIFACT_BODY_CANDIDATE_METHOD =
  'mmi-snapshot-body-type-transition-v0' as const;

export type StructuredArtifactBodyCandidateSignal = {
  value: 'present' | 'absent';
  kind: 'categorical';
  method: typeof MMI_STRUCTURED_ARTIFACT_BODY_CANDIDATE_METHOD;
  confidence: null;
};

type NormalizedCell = {
  row: number;
  column: number;
  text: string;
};

const PLAIN_DECIMAL =
  /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/u;

export function deriveMmiStructuredArtifactBodyCandidateSignal(
  snapshot: WorksheetFormatSnapshot,
): StructuredArtifactBodyCandidateSignal {
  const rows = normalizedRows(snapshot);

  for (const candidate of rows.slice(0, 3)) {
    if (
      candidate.cells.length < 2
      || candidate.cells.some((cell) => isNumericLike(cell.text))
    ) {
      continue;
    }

    const bodyRows = rows
      .filter((row) => row.row > candidate.row)
      .slice(0, 4);
    if (bodyRows.length < 2) {
      continue;
    }

    for (const candidateCell of candidate.cells) {
      const samples = bodyRows
        .map((row) => row.byColumn.get(candidateCell.column))
        .filter((value): value is string => value !== undefined);

      if (samples.length < 2) {
        continue;
      }
      const numericCount = samples
        .filter((value) => isNumericLike(value))
        .length;
      if (numericCount * 2 > samples.length) {
        return signal('present');
      }
    }
  }

  return signal('absent');
}

export function isStructuredArtifactPlainNumericLike(
  value: string,
): boolean {
  return isNumericLike(value.trim());
}

function normalizedRows(
  snapshot: WorksheetFormatSnapshot,
): Array<{
  row: number;
  cells: NormalizedCell[];
  byColumn: Map<number, string>;
}> {
  const byRow = new Map<number, NormalizedCell[]>();

  for (const cell of snapshot.cells) {
    const text = cell.text.trim();
    if (text.length === 0) {
      continue;
    }
    const normalized = {
      row: cell.row,
      column: cell.column,
      text,
    };
    const cells = byRow.get(cell.row) ?? [];
    cells.push(normalized);
    byRow.set(cell.row, cells);
  }

  return [...byRow.entries()]
    .sort(([left], [right]) => left - right)
    .map(([row, cells]) => {
      const sorted = [...cells]
        .sort((left, right) => left.column - right.column);
      return {
        row,
        cells: sorted,
        byColumn: new Map(
          sorted.map((cell) => [cell.column, cell.text]),
        ),
      };
    });
}

function isNumericLike(value: string): boolean {
  return PLAIN_DECIMAL.test(value);
}

function signal(
  value: 'present' | 'absent',
): StructuredArtifactBodyCandidateSignal {
  return {
    value,
    kind: 'categorical',
    method: MMI_STRUCTURED_ARTIFACT_BODY_CANDIDATE_METHOD,
    confidence: null,
  };
}
